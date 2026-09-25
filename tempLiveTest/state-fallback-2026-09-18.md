# State-Transition Protection & Safe Fallback/Error Handling — Validation Report

**Date:** 2026-09-18
**Harness:** `tempLiveTest/stateFallbackSmoke.js` (re-runnable; `--killswitch` for leg B)
**Results:** `tempLiveTest/_statefallback-results.json`
**Outcome:** **72 PASS / 0 FAIL / 0 SKIP** — matrix leg 64 PASS + kill-switch leg 8 PASS. **SMOKE_EXIT=0** both legs.

## What was validated

### State-transition matrix (leg A — scratch WO SF-A driven through every state)
Illegal mutation from each state returns 400 with the `{ success:false, message, errors[] }` envelope; legal transitions 2xx; idempotency holds:

| From state | Guarded-400 (asserted) | Allowed-2xx |
|---|---|---|
| DRAFT | finalize, start production, complete production, doc upload | add/delete group, add items |
| ANALYZED | start production, doc upload | re-analyze (idempotent), **item add → auto-reset to DRAFT** (asserted) then re-analyze |
| FINALIZED | analyze, add item, add group, doc upload | finalize again (idempotent 200); concurrent double finalize → one 200 + one 409 (gated race, intended) |
| PRODUCTION | analyze, finalize, add item | complete tasks, doc upload → **auto-completes WO** (asserted) |
| COMPLETED | analyze, finalize, start production, add item, add group, task toggle (409/400) | doc upload (200) |

- Complete-time guards confirmed: `complete` with open tasks → 400; all tasks done but firmware items + 0 docs → 400 `"Documentation files are required before completing (firmware items present, no documents attached)"`; doc upload then auto-completes PRODUCTION→COMPLETED.
- `PUT status:DRAFT` from COMPLETED → 400 (rollback is ANALYZED-only).

### Rollback (scratch WO SF-R)
`ANALYZED → PUT status:DRAFT` → 200 and **fully clears** analysis rows, `production_tasks`, and `CODER_REVIEW` notifications; re-analyze works afterwards.

### Error handling / envelope contract
- Duplicate WO create → **409** `"A work order with this number already exists"` (service pre-check `workOrderService.js:82`, not the PG 23505 map — 23505 is the race fallback).
- Nonexistent WO → 404 envelope; non-integer id → 400 (`requireIntegerParams`); malformed JSON body → 400 `"Malformed JSON body"`; unknown route → 404 envelope; missing required create fields → 400 validation.
- Every error carries the full envelope (`success:false`, `message`, `errors[]`); no raw stack/500 leakage anywhere probed.

### Semantic kill switch (leg B)
- Enabled boot (`.env SEMANTIC_ENABLED=1`): probe item analyze → 200, `semanticHits=1`, no `SEMANTIC_ASSIST` suggestion. Semantic pipeline engages without breaking analyze (null-safe correlate).
- Disabled boot (`.env SEMANTIC_ENABLED=0`, documented kill switch): analyze → 200, **`semanticHits=0`**, **zero** `SEMANTIC_ASSIST` suggestions, complexity levels still served. Kill switch degrades to byte-identical lexical behavior. `.env` restored to `1` and backend stopped after the leg.

## Issues found & disposition
Per approval: probe fail → investigate; probe success → **no refactor**; static observations → keep as notes.

Two initial assertion failures were **harness expectation bugs, not product defects** (investigated, corrected, re-run green):
1. Concurrent double finalize `{200,409}` — the 409 is the intended gated-race protection (`workOrderService.js:698`), matching the earlier concurrency smoke.
2. Duplicate create is a deliberate **409** (service pre-check `workOrderService.js:82`), not 400.

## Static observations (noted, not changed)
1. **Process-env kill switch is defeated by `config/db.js:6`** (`dotenv.config({ override: true })`). Setting `SEMANTIC_ENABLED=0` in the OS/process environment is clobbered back to `.env`'s value on module load. Only the documented path — `SEMANTIC_ENABLED=0` in `backend/.env` — works. `override:true` silently re-loads the whole `.env` over real environment variables; flagging since the kill switch is advertised as "env-gated," but the documented `.env` mechanism is correct.
2. **WO-level title/customer PUT is not state-gated** (only items/groups are): `PUT /work-orders/:id { title }` returns 200 even after COMPLETED. Probe asserted 200 and recorded it. No refactor — likely intentional (history/description edits), but worth a product decision.
3. **Rejected doc uploads orphan physical files**: multer writes the file to `uploads/` before the service rejects DRAFT/ANALYZED/FINALIZED uploads with 400; no DB row is created, and the DB-wipe cleanup cannot remove the file. Minor accruing residue in `backend/uploads/`.
4. **Item add/update auto-reset to DRAFT does not clear stale classifications** (only full rollback does via `clearAnalysis`). Benign: re-analyze overwrites.
5. **Analyze loop is non-atomic**: a mid-loop DB write failure leaves partial classifications while the WO stays DRAFT. Re-analyze recovers; no 500. Noted only.
6. **Baseline drift:** live users = 5 (AGENTS.md says 4) — pre-existing `pm@test`(16) / `admin@test`(47) leftovers from earlier sessions, untouched. Cleanup verified: users restored to 5 pre-count, 0 scratch `SF-*` WOs, 0 duplicate `classification_matches` globally.

## Environment state after run
- Backend stopped by harness command; `.env` restored (`SEMANTIC_ENABLED=1`); no scratch rows left; no learned `KB-CODER-*` rows left.
- Product code: **not modified**.

## Re-run
```bash
# leg A: default boot (SEMANTIC_ENABLED=1)
node stateFallbackSmoke.js
# leg B: documented kill switch (.env SEMANTIC_ENABLED=0), restore to 1 after
node stateFallbackSmoke.js --killswitch
```