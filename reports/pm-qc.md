# PM Side QC — Negative / Wrong-Input Test Findings

Date: 2026-09-02
Scope: Phase 1 QC — wrong-format input, wrong flow, RBAC, non-mutating negative tests against the PM work-order surface. Live smoke on `localhost:5000`, tokens for pm@demo (PM) and coder@demo (CODER).

## Result summary
- 6 confirmed defects (all leak raw errors as HTTP 500) plus several code-verified (non-executed) wrong-flow gaps.
- Every 500 here is an unhandled PostgreSQL error surfacing via the generic handler (`backend/src/middleware/errorHandler.js` maps everything to 500; no pg-code translation).
- All QC attempts verified non-mutating — no rows left behind (residue check: duplicates=0, QC items=0, bad groups=0).

## Confirmed defects (HTTP 500 — raw error leak)

| # | Test | Actual | Expected | Root cause |
|---|---|---|---|---|
| 1 | `GET /api/work-orders/abc` | 500 `invalid input syntax for type integer: "abc"` | 404/400 | Path param not coerced/validated (`workOrderController.js:35-42` passes `req.params.id` raw → `findById` pg cast) |
| 2 | `GET /api/work-orders/1e3` | 500 (same) | 404/400 | ditto |
| 3 | `GET /api/work-orders/999999999999999999` | 500 `value ... out of range for type integer` | 404 | `work_orders.id` is int4; no range guard |
| 4 | `PUT /api/work-orders/items/abc` | 500 (cast) | 404/400 | `req.params.itemId` raw → `findItemById` |
| 5 | `DELETE /api/work-orders/items/abc` | 500 (cast) | 404/400 | ditto |
| 6 | `PUT /api/work-orders/21/groups/abc` | 500 (cast) | 404/400 | `req.params.groupId` raw → `findGroupById` |
| 7 | `DELETE /api/work-orders/21/groups/abc` | 500 (cast) | 404/400 | ditto |
| 8 | `DELETE /api/work-orders/21/access/abc` | 500 (cast) | 404/400 | `req.params.userId` raw → `revokeWorkOrderAccess` |
| 9 | `POST /api/work-orders` duplicate `wo_number = "WO-02"` | 500 `duplicate key value violates unique constraint "work_orders_wo_number_key"` | 409/400 | no duplicate check; UNIQUE violation leaks |
| 10 | `POST /api/work-orders/21/items` `quantity: "abc"` | 500 (cast) | 400 | `validateItemCreate` does not validate quantity (`workOrderValidator.js:90-105`) |
| 10b | `quantity: "2.5"` | 500 (cast) | 400 | ditto (item-update path validates integer quantity; create path does not — asymmetry) |
| 11 | `POST /api/work-orders/21/groups` `machine_model_id: 999999` | 500 FK violation `work_order_groups_machine_model_id_fkey` | 400/404 | numeric ids pass through `resolveGroupTargets` unchecked (`workOrderService.js:20-32`) |
| 11b | `machine_model_version_id: 999999` | 500 FK violation | 400/404 | ditto |
| 12 | `POST /api/work-orders/21/access` missing or `user_id: "abc"` | 500 `invalid input syntax for type integer: "NaN"` | 400 | `Number(undefined)`/`Number("abc")` -> NaN reaches SQL (`workOrderController.js:287` reads `req.body.user_id`) |

## Guarded / healthy behaviors (PASS — verified live)
- RBAC: pm -> `startProduction`, task complete, production complete -> **403**; coder -> `analyze`, `pm-dashboard`, `users/pm` -> **403**; pm -> dashboard/users/pm/WO detail -> 200.
- Access grant with valid data: nonexistent `user_id` -> **404** "User not found"; grant to work-order owner -> **400** "The owner already has access".
- Group modification after finalization -> **400** "... cannot be modified after finalization" (DRAFT/ANALYZED only).
- All failure paths rolled back cleanly (no orphaned work_orders/items/groups).

## Code-verified wrong-flow gaps (not executed — would mutate live data)

| Gap | Where | Impact |
|---|---|---|
| `analyze` has no status guard -> can force a FINALIZED/PRODUCTION/COMPLETED WO back to ANALYZED + reclassify | `workOrderService.js:338-448` | state regression |
| `addItem`/`deleteItem` block only FINALIZED -> add/delete allowed during PRODUCTION/COMPLETED | `:253`, `:304` | task snapshot inconsistency |
| `updateWorkOrder` accepts writable `status` (DRAFT/ANALYZED/FINALIZED) -> can bypass finalize checks or regress FINALIZED->ANALYZED (dangling tasks; point-3 purge only runs on DRAFT) | `workOrderValidator.js:51` | business-rule bypass |
| String model/version codes auto-create rows on typo (`findOrCreateByCode/Version`) — wrong input silently pollutes machine models | `resolveGroupTargets` `:18-34` | data pollution (no picker on Create page, free-text inputs) |
| Item create accepts `quantity <= 0` (negative stored; `0` coerced to 1 via `quantity || 1`) | `workOrderRepository.js:349` | negative hours in estimates |
| `customer` is required server-side but the Create page field is not marked `required` | `WorkOrderCreate.jsx:86-89` | generic server 400 on empty submit |

## Root-cause note
`backend/src/middleware/errorHandler.js` has no translation layer — PostgreSQL codes `22P02` (bad int literal), `23505` (unique violation), `23503` (FK violation), and JS `NaN` values all surface as generic 500 with raw DB text, leaking schema/value details.

## Recommended fixes (not applied — per scope)
1. Coerce/validate all path params (`:id`, `:itemId`, `:groupId`, `:userId`) to positive integers before any query.
2. Add pg-code mapping in `errorHandler` (22P02/22007/23505/23503 -> 400/409 with friendly messages).
3. Extend `validateItemCreate` to validate `quantity` as positive integer (mirror `validateItemUpdate`).
4. Friendly duplicate-`wo_number` check / 409.
5. Validate `user_id` presence + integer via a `validateAccess` middleware -> 400 instead of NaN.
6. Phase 2 candidates (separate work items): status guards for `analyze`/`addItem`/`deleteItem`; remove writable `status` from work-order update; model/version existence + match validation; model picker in UI.

## Appendix — test fixtures used
- `machine_model.id=1` / `machine_model_ver.id=1` (existing pair).
- WO-21 (DRAFT, owned by pm@demo) and WO-8 (COMPLETED, owned by pm@test) as targets.
- Residue verification: `work_orders.title='QC dup'`=0, QC items=0, `work_order_groups.machine_model_id=999999`=0.

## Resolution — P1 fixes shipped (2026-09-02)

All P1 defects fixed and re-verified live (23 + 9 assertions PASS, zero data residue; backend module load OK).

| Fix | Implementation | Verified result |
|---|---|---|
| 1. Path-param validation | `backend/src/middleware/validateParams.js` `requireIntegerParams(...)` applied to every param-bearing work-order route (`workOrderRoutes.js`) | `/work-orders/abc`, `/1e3`, `/items/abc`, `/groups/abc`, `/access/abc` -> **400** with `Invalid <param> parameter`; huge int -> 400 (via range mapping) |
| 2. Central pg error mapping | `errorHandler.js` maps 22P02/22P01/22P03/22007/22003/23502/23503/23514 -> 400, 23505 -> 409, with friendly generic messages (no raw DB text) | nonexistent model/version id -> 400 "Referenced record does not exist or is in use"; catches the whole error class globally |
| 3. Item-create quantity validation | `validateItemCreate` now mirrors `validateItemUpdate` (positive integer) | `quantity='abc'`/`'2.5'` -> 400 "Validation failed" |
| 4. Duplicate wo_number | `workOrderRepository.findByWoNumber` + pre-check in `createWorkOrder` -> ApiError 409 | `POST /work-orders` with `WO-02` -> **409** "A work order with this number already exists" |
| 5. Access-grant user_id validation | new `validateAccessGrant` middleware wired to `POST /:id/access` | missing / `'abc'` / wrong field -> 400 (no more `NaN` 500); valid paths unchanged: nonexistent -> 404, owner -> 400 |
| 6. Extend param validation to remaining routers | `requireIntegerParams` applied to complexity, kb, machine-model/id+versions, user, notification routers | `.../abc` & `.../1e3` -> 400 `Invalid <param> parameter` before any DB hit; valid ids unchanged (verified 10 live asserts + valid-id spot checks) |

Regression checks (still PASS): coder -> dashboard/users/pm 403; pm -> startProduction/task/complete 403; coder -> analyze 403; pm dashboard/users/pm/WO detail 200; group edits on finalization 400; residue=0.

Phase 2 wrong-flow gaps (analyze status guard, item add/delete during PRODUCTION/COMPLETED, writable `status`, model-typo auto-create, customer UI mismatch) remain open — see "Code-verified wrong-flow gaps".

## Manual verification checklist (PM)

How to exercise the P1 fixes by hand.

### 0. Start everything

```powershell
# backend (port 5000)
cd "C:\Program Files\Firmware Custom\backend"; npm run dev
# frontend (separate window)
cd "C:\Program Files\Firmware Custom\frontend"; npm run dev
```

### 1. API checks (paste whole block in PowerShell)

```powershell
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/api/auth/login' -ContentType 'application/json' -Body '{"identifier":"pm@demo","password":"password123"}'
$h = @{ Authorization = "Bearer $($login.data.token)" }
function Try-Get($name, $url) {
  try { $r = Invoke-WebRequest -Uri $url -Headers $h -SkipHttpErrorCheck; "$name -> $($r.StatusCode)" }
  catch { "$name -> STOPPED (server down?)" }
}
Try-Get 'GET /work-orders/abc'    'http://localhost:5000/api/work-orders/abc'
Try-Get 'GET /work-orders/1e3'    'http://localhost:5000/api/work-orders/1e3'
Try-Get 'huge int'                 'http://localhost:5000/api/work-orders/999999999999999999'
Try-Get 'PUT /items/abc'           'http://localhost:5000/api/work-orders/items/abc'
```

Expected results vs before:

| Check | Before fix | After fix |
|---|---|---|
| `GET /api/work-orders/abc` | 500 | **400** `Invalid id parameter` |
| `GET /api/work-orders/1e3` | 500 | **400** |
| huge int | 500 | **400** |
| `PUT /api/work-orders/items/abc` | 500 | **400** `Invalid itemId parameter` |
| `DELETE /api/work-orders/groups/abc` | 500 | **400** `Invalid groupId parameter` |
| `DELETE /api/work-orders/:id/access/abc` | 500 | **400** `Invalid userId parameter` |
| create duplicate `WO-02` | 500 | **409** "A work order with this number already exists" |
| item create `quantity: 'abc'` | 500 | **400** `Validation failed` |
| add group `machine_model_id: 999999` | 500 | **400** "Referenced record does not exist or is in use" |
| grant access `user_id: 'abc'` | 500 `NaN` | **400** |

Note on `PUT /items/abc`: it expects a body, so send `{"title":"x"}` (`x` = any non-empty title). Omitting it fails for a different reason (missing title).

### 2. UI checks (browser, login pm@demo)

1. Dashboard still loads (KPIs, work queue) — confirms no regression.
2. Work Orders -> Create — type an existing number (e.g. `WO-02`) -> red banner "A work order with this number already exists" instead of a crash.
3. Work Orders -> Create — a valid new number still creates fine.
4. Open a DRAFT WO (e.g. WO-21) -> grant access via dropdown -> granting yourself shows "The owner already has access".
5. Bad URL in address bar (e.g. `/work-orders/abc`) -> clean "invalid/not found" handling instead of a 500.
6. Normal flows unchanged: analyze, finalize, group edit on finalized WO -> friendly 400, coder blocking (403) intact.