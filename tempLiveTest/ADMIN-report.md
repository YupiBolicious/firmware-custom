# ADMIN Side QA/QC Smoke Test Report

Date: 2026-09-03
Runner: `tempLiveTest/adminSmoke.js` (re-runnable) + `tempLiveTest/_admin-results.json`
Round 2: `tempLiveTest/adminSmoke2.js` + `tempLiveTest/_admin2-results.json`
Backend: `localhost:5000` (already running, reused; left running)
Scope: every ADMIN endpoint — happy path, wrong-input (400/409), RBAC (403), settled-DB verification, then FULL cleanup of scratch rows. No work-order mutations (kept in PM scripts per scope).

## Result
**161 PASS / 4 FAIL** on the initial run. All 4 failures were confirmed application bugs (not harness issues). **Both have since been fixed; a re-run passes 165/165.** Cleanup verified: zero scratch residue, real data intact.

## Coverage matrix (all PASS unless noted)

### A. Admin dashboard `GET /api/admin-dashboard`
- No-params (8-week default) 200 + shape (`kpis/health/users/classification/config/trend`) + KPIs sane + health online.
- Valid `?from&to` 200 + granularity + buckets array.
- Bad `from` format 400. PM/CODER 403. Unauth 401.
- **BUG-1 (FAIL):** `?to=2026-13-99` (passes `DATE_RE` format check, invalid calendar date) → **500** `date/time field value out of range` (PG 22008, unmapped in `errorHandler.js`). Expected 400.

### B. User management `/api/users`
- List (ADMIN 200, contains admin@demo; PM/CODER 403; unauth 401). `/pm` ADMIN+PM 200 (all PM-role), CODER 403.
- Create 201 + DB row (email lowercased) + `user_roles=[PM]` + `USER_CREATED` audit.
- Dup email / dup username / existing email → 409.
- 7 wrong-input creates → 400 (bad email, short/bad username, missing/bad roles, short password, missing full_name). PM create 403.
- Update full_name+roles 200 + DB verified (role replace to CODER). 4 wrong updates → 400. Nonexistent 404. `abc` 400. PM 403.
- Reset password 200 + new-password login works. Short 400. Nonexistent 404. `abc` 400. PM 403.
- Deactivate → login blocked (403). Confirms `is_active` enforcement.

### C. Complexity levels `/api/complexity-levels`
- List open to ADMIN/PM/CODER 200 with L0–L5. Full CRUD 201/200 + soft-deactivate verified in DB.
- Dup code (incl. lowercase) + existing L0 → 409. Missing code/name, negative/NaN hours → 400. `abc` → 400, nonexistent → 404. PM create/update/delete → 403.

### D. Knowledge base `/api/kb` (ADMIN-only; PM/CODER 403 throughout)
- List/get/create/update all correct; dup `kb_code` 409; missing `kb_code`/`title` 400 (NOT NULL enforced); bad `complexity_level_id` FK 400; nonexistent 404; `abc` 400.
- `POST /:id/test`: valid `sample_text` 200 with `verdict`+numeric `score`; missing sample 400; nonexistent 404; PM 403.
- **Hard DELETE included (approved):** `DELETE /:id` 200, row gone in DB, GET-after 404, second DELETE 404, `abc` 400. Confirms hard-delete behavior (vs soft elsewhere).

### E. Machine models `/api/machine-models` (ADMIN-only; PM/CODER 403)
- List/get/create (incl. dup 409, missing code 400), versions CRUD (create 201, dup version 409, bad model 404, `abc` 400), version update/delete (soft-deactivate + excluded from list), model delete (soft + excluded) — all PASS.
- **BUG-2 (FAIL ×3):** `PUT /api/machine-models/:id` → **500** `column "updated_at" of relation "machine_model" does not exist`. `machine_model` has no `updated_at` column but `machineModelRepository.updateModel` sets `updated_at = NOW()`. Consequence: model rename never persists (DB check FAIL), and even a nonexistent id returns 500 instead of 404 (the UPDATE runs before the 404 path can trigger). `update model abc 400` passes only because param validation fires first.

### F. Audit log `GET /api/audit-log`
- ADMIN/PM/CODER 200 (not ADMIN-exclusive — by design) with `items/actions/users`. `limit=5` respected. `abc`/`0`/`1001` → 400. Unauth 401.

### G. Cleanup + integrity (all PASS)
- Scratch users/complexity/KB/models/versions/user-audit all removed (0 remain).
- Real data intact: user count unchanged, complexity L0–L5 present, model id=1 present, kb id=1 present.

## Resolution
- **BUG-1 FIXED (2026-09-03):** `backend/src/controllers/adminDashboardController.js` now validates real calendar dates (`isRealDate`: format + `Date` round-trip, so `2026-13-99` and `2026-02-30` → 400 before any DB hit); `backend/src/middleware/errorHandler.js` maps PG `22008` → 400 (`Invalid date/time value`) as defense-in-depth. Verified live: bad `to`/`from`/format → 400, valid range + defaults → 200.
- **BUG-2 FIXED (2026-09-03):** dropped the nonexistent `updated_at = NOW()` from `machineModelRepository.updateModel` to match the real schema (no `updated_at` on `machine_model`). Verified live: valid PUT → 200 + rename persists, nonexistent id → 404. Full `adminSmoke.js` re-run: **165 PASS / 0 FAIL**.

## Files (round 1)
- `tempLiveTest/adminSmoke.js`, `tempLiveTest/_admin-results.json`, `tempLiveTest/ADMIN-report.md` (this file).
- Probe helpers `_probe_constraints.js`, `_probe_nullable.js`, `_probe_modelcols.js` (scratch, deletable).

## Round 2 — notifications, edges, IDOR, self-lockout, frontend (93 PASS / 0 FAIL)

Runner: `tempLiveTest/adminSmoke2.js`. All scratch rows cleaned; WO-21 restored (DRAFT, 0 grants); user count back to 4.

### N. Notification API as admin
List / unread-count / mark-read / mark-all-read all 200; `abc` → 400; nonexistent id → 200 `updated:false` (no 500); unread drops to 0 after mark-all-read. **Cross-user isolation holds:** admin marking pm@demo's notification → `updated:false`, owner's row stays unread.

### G. Admin as grantee (WO-21, reversible)
Grant → 200 + DB row; `ACCESS_GRANTED` → {admin, owner}; revoke → 200 + row removed; `ACCESS_REVOKED` → {admin, owner}. All WO-21 test notifications + scoped audit rows deleted after.
**Harness note:** `notify()` in grant/revoke is fire-and-forget (not awaited), so immediate reads race the inserts — the script polls (`waitFor`, ≤5s) before asserting. Same lesson as round 1: assert notifications on settled state. Worth noting as a reliability observation: API success can return before notifications persist.

### I. IDOR probe — FINDING CONFIRMED
`GET /api/work-orders/21/access` as coder@demo (verified no grant on WO-21) → **200 with grant data**. `listWorkOrderAccess` (`workOrderService.js`) performs no manage-check, unlike grant/revoke. Any authenticated PM/CODER can enumerate access grants on any WO. Recommend adding `assertCanManageAccess` to the list path.

### P. Rollback purge reaches admin
Scratch WO (`ADMPURGE-*`, fully wiped after): ambiguous item → `CODER_REVIEW`, unread copies to admin + coder verified pre-rollback; after PUT rollback to DRAFT both copies purged (0 rows). The lock/purge path covers admin recipients, not just coders.

### W. Wrong-input edges (all documented behavior, no 500s)
- Dashboard `from>to` → 200 empty buckets (no crash); only-`from` → 200; 2020→2026 span → 200 `month` granularity.
- Users: dups case-insensitive → 409; `email` in update body silently ignored (200, DB unchanged); empty-body update → 200; `roles:[]`/string → 400; create-with-`ADMIN`-role → 201; reset-pwd on deactivated user → 200 but login stays blocked.
- Complexity: recreate-after-deactivate → 409 (`findByCode` ignores `is_active`); reactivate → 200.
- KB: update-to-dup-`kb_code` → 409; `fw_related:null` → 400; deactivated KB still listed by `GET /kb`; `/test` tiers verified (exact-ish → EXACT_MATCH/SIMILARITY, nonsense → NO_MATCH).
- Models: update-to-dup-code → 409; version-missing-code → 400; version-update-to-dup → 409; delete-model-with-versions → 200 but versions remain listed under the deleted model (orphan behavior, documented).
- Audit `limit`: 1 respected, 1000 → 200, -5 / 2.5 → 400.

### AU. Auth edges
Wrong password / unknown user → 401; missing password → 4xx (no 500); `?token=` query param accepted (URL-token leak surface, documented); tampered token → 401.

### S. Self-deactivation — FINDING (no guard)
Scratch ADMIN deactivates itself → 200, login blocked, real admin reactivates → works. There is **no self-lockout protection** (an admin can deactivate their own account, including hypothetically the last active admin). Recommend a guard (block self-deactivate or require ≥1 active ADMIN). Real admin@demo never touched.

### Frontend checks
- `npm run build` passes (11.8s; only a chunk-size warning).
- Dev server (5173) serves index 200; `/api` proxy → backend health 200.
- Wiring audit: all 6 admin pages call exactly the tested endpoints (AdminDashboard → `/admin-dashboard`; UserManagement → `/users*`; ComplexityLevels → `/complexity-levels*`; KnowledgeBase → `/kb*` + `/complexity-levels`; MachineModels → all 8 model/version routes; AuditLog → `/audit-log`; bell → `/notifications*`).
- `/machine-models` + `/users` under `RoleRoute ADMIN`; `/audit-log` under all-three. **Minor inconsistency:** `/complexity-levels` and `/knowledge-base` routes have **no** `RoleRoute` — any authed user can open them; mutations hide behind `isAdmin` and API errors render as `alert-error` banners (verified in code), so PM/CODER see a clean error state rather than a crash. Consider adding the route guards for consistency.
- Limitation: no headless-browser tool in this environment, so no click-through render test — build + serve + proxy + wiring/guard audit is the achievable frontend smoke.

## Files (round 2)
- `tempLiveTest/adminSmoke2.js`, `tempLiveTest/_admin2-results.json`; findings in this file.
| # | Endpoint | Was | Now | Root cause / fix |
|---|---|---|---|---|
| BUG-1 | `GET /api/admin-dashboard?to=2026-13-99` | 500 (PG 22008) | 400 | Date passed format regex but wasn't a calendar date; fixed with `isRealDate` validation + 22008→400 map |
| BUG-2 | `PUT /api/machine-models/:id` | 500 `column "updated_at" ... does not exist` | 200 / 404 | `updateModel` set a nonexistent column; removed to match schema |

## Files
- `tempLiveTest/adminSmoke.js`, `tempLiveTest/_admin-results.json`, `tempLiveTest/ADMIN-report.md` (this file).
- Probe helpers `_probe_constraints.js`, `_probe_nullable.js`, `_probe_modelcols.js` (scratch, deletable).

## Fix applied — IDOR on list access (2026-09-03, verified 10/10)
Round 2 finding I is resolved: `GET /api/work-orders/:id/access` (`listWorkOrderAccess`) now calls the existing `assertCanEditWorkOrder`, so only ADMIN / owner / grantees can list grants — outsiders get 403 (was 200). Grantee visibility deliberately preserved (matches WO-detail access semantics; no frontend regression). Verified live by `tempLiveTest/_verify_idor.js` (outsider 403, grantee/owner/admin 200, ex-grantee 403 after revoke; WO-21 restored to 0 grants, test notifications cleaned).

## Fix applied — self-deactivation guard (2026-09-03, verified 13/13)
Round 2 finding S is resolved: `PUT /api/users/:id` with `is_active:false` on your own ADMIN account now returns **400** (`Cannot deactivate your own account while you are the only active ADMIN`) when only 1 active ADMIN remains; allowed when >1 remain. Other-deactivation (admin on another user) unchanged. Implementation: `userRepository.countActiveAdmins()` + guard in `userService.updateUser`; backend restarted to pick it up. Verified live by `tempLiveTest/_verify_selfdeact.js` (13 PASS / 0 FAIL, scratch users wiped, user count back to 4, real admin untouched). `PUT /api/users/:id` with `is_active:false` on your own ADMIN account now returns **400** (`Cannot deactivate your own account while you are the only active ADMIN`) when only 1 active ADMIN remains; allowed when >1 remain. Other-deactivation (admin on another user) unchanged. Implementation: `userRepository.countActiveAdmins()` + guard in `userService.updateUser`; backend restarted to pick it up. Verified live by `tempLiveTest/_verify_selfdeact.js` (13 PASS / 0 FAIL, scratch users wiped, user count back to 4, real admin untouched). IDOR finding (I) left as documented — not in scope per user choice.
