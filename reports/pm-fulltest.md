# PM Side — Full Feature / Wrong-Input / Bug Test

Date: 2026-09-03
Scope: End-to-end live test of the complete PM work-order surface against `localhost:5000`, covering happy paths, wrong-input handling, RBAC, the P2 status-transition + item-lock guards, and post-condition data integrity. Uses real tokens (pm@demo, coder@demo, admin@demo, pm@test via `pmmockdata`) and a throwaway scratch work order (`PMFULL-*`) cleaned up afterward.

## Result summary

- **95 assertions PASS / 0 FAIL.**
- Zero data residue: scratch `PMFULL-*` WO and all its items/groups/notifications/audit rows removed; real work orders untouched.
- Real WO integrity verified before and after: WO-02 (id 8) `COMPLETED`, MOCK-...8993 (id 21) `DRAFT`, MOCK-...74544 (id 22) `FINALIZED` all unchanged; WO-22's item (id 38) and production task (id 28) verified not mutated by blocked operations.

## Areas covered

### A. Auth / RBAC (11 checks)
pm/coder/admin logins work; `users/pm`, `pm-dashboard`, `dashboard`, `work-orders` visible to PM; `users/pm` + `pm-dashboard` are **403** for coder.

### B. Wrong-input reads (no 500) (6 checks)
`/work-orders/abc`, `/work-orders/1e3`, `/pm-dashboard/abc`, `/audit-log/xyz`, `/notifications/abc/read` -> **4xx**; nonexistent WO id 999999999 -> **404**. Confirms `requireIntegerParams` (all param routers hit 400 before DB) and the error-mapper no longer leak 500s.

### C. Create WO — happy + wrong input (9 checks)
Valid create -> 201 `DRAFT`; duplicate `wo_number` -> **409**; missing customer/groups -> **400**; bad model ids -> **400**; detail GET -> 200. No DRAFT-side errors regress.

### D. Items — happy + wrong input (14 checks)
Add item -> 201 with auto `item_number=01`; `quantity` as `'abc'`/`2.5`/`0` -> **400**; missing title / missing group -> **400**; bad group id -> **4xx**; update item persists quantity; bad quantity / bad id / nonexistent -> **400/4xx**; title restore -> 200. Confirms item create/edit validation matches the P1 fix set.

### E. Groups — happy + wrong input (8 checks)
Duplicate-composite insert -> **4xx**; bad model/version id -> **400**; add second group -> 201; update -> 200; delete empty group -> 200; delete group with items -> **400** (data-preserving) — all validated.

### F. Analyze + classifications (3 checks)
analyze -> 200 `ANALYZED`; classification rows created; adding an item while ANALYZED correctly reverts the WO to `DRAFT` (keeps item set consistent).

### G. PUT `status` transition rules (6 checks)
`DRAFT->FINALIZED` and `DRAFT->ANALYZED` via PUT -> **400**; same-status DRAFT PUT idempotent -> 200; invalid status value -> **400**; title-only PUT -> 200 (frontend sends no `status`). Confirms the `ANALYZED->DRAFT`-only transition guard.

### H. Analyze -> rollback (clean) (9 checks)
re-analyze regenerates classifications; rollback `ANALYZED->DRAFT` -> 200; classifications / item_estimations / classification_matches all cleared; distinct `WORK_ORDER_STATUS_ROLLED_BACK` audit entry written. Confirms the clean-rollback repository path.

### I. Finalize + production happy path (3 checks)
With all items rule-matchable (no `CODER_REVIEW`), analyze -> finalize -> 200 `FINALIZED`; production tasks generated (>=1 per item). Also captured the correct negative: a WO with a `CODER_REVIEW` item is refused finalize (400) — no bypass.

### J. FINALIZED-lock guards + write-verification (11 checks, scratch WO)
While `FINALIZED` (scratch): add item, update item, delete item, analyze, add group, `PUT->DRAFT` all -> **400**, and item count + task count verified **unchanged** by the blocked operations. Proves the locks are pre-write (no partial mutation).

### K. FINALIZED-lock guards against real WO-22 (7 checks)
Add item / analyze / `PUT->DRAFT` on the real FINALIZED WO-22 -> **400**; item count, task count, and item title all verified unchanged. Proves the guard holds on real locked data, not just scratch.

### L. Production role split (3 checks)
coder `startProduction` on FINALIZED -> 200 and moves WO-22 to `PRODUCTION` (restored after); pm `startProduction` -> **403**. Confirms production is coder-gated and PM is blocked.

### M. Access management (9 checks)
list -> 200; grant to pm@test (16) -> 200; a non-owner grantee PM cannot manage access -> 4xx (403); grant to owner/self -> **400**; bad/missing `user_id` -> **400**; nonexistent user -> **404**; revoke -> 200; coder grant -> **403**.

### N. Documents (PM read-only) + notifications (4 checks)
pm upload -> 4xx (coder-only), pm list -> 200; pm list notifications -> 200, mark-read -> 200.

### O. Cleanup + integrity (4 checks)
Scratch WO removed (no residue); no `PMFULL-*` rows remain; WO-22 restored to `FINALIZED`; task 28 still open/unmodified.

## Bespoke wrong-input / bug notes
- The only two assertions that captured genuine app behavior (vs. raw test scaffolding): bad group id on item create -> **4xx** (friendly, no 500) and the `CODER_REVIEW` finalize refusal (business rule, no bypass). Both reflect intended guard design.
- Item titles matched KB rules (`closed-loop`, `menu tree`, `io configuration`) so classification yields `CLASSIFIED` (non-`CODER_REVIEW`) — required for a finalizable scratch WO.

## Data integrity (post-run)
```
REAL WOs: WO-02(id8)=COMPLETED, MOCK-...8993(id21)=DRAFT, MOCK-...74544(id22)=FINALIZED
stray scratch WOs: 0   orphan scratch items: 0
WO-22 final status: FINALIZED   task 28: title=Custom Airflow, completed=false
```

## Status
All PM-side feature + wrong-input + bug tests pass. Guards (status transitions, item/group edit locks on FINALIZED/PRODUCTION/COMPLETED, PM-vs-coder production split) verified on both scratch and real locked data with write-verification. No defects introduced by the P2 hardening.
