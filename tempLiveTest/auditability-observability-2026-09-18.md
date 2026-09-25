# Auditability & Observability Validation — 2026-09-18

**Mode:** live smoke against localhost:5000 (`tempLiveTest/auditObservabilitySmoke.js`), report-only. **Result: 47 PASS / 0 FAIL.**
Results: `_auditobservability-results.json`.

## Scope
1. Validate end-to-end audit coverage: drive a scratch work order through the full lifecycle and assert every `audit_trail` write (action, details payload, actor, ip, entity links).
2. Validate the `/api/audit-log` contract (envelope, filters, search, paging, RBAC, error paths).
3. Validate observability surface (`/api/health`, admin dashboard health block, `/api/analyze` perf envelope, classification telemetry script).

## Audit coverage — verified
Full lifecycle of scratch `AUD-WO-<ts>` (create → grant coder → 3 items → analyze → review CODER_REVIEW → finalize → start production → complete 1 task → doc upload → auto-complete). All rows asserted against the joined `audit_trail.view_audit_log` shape: `user_name`, `wo_number`, `item_number`, `details`, `ip_address`.

| Action | Verified | Actor | Details checked |
|---|---|---|---|
| WORK_ORDER_CREATED | PASS | pm | `wo_number`, `group_count` |
| WORK_ORDER_ACCESS_GRANTED | PASS | pm | granted target = coder |
| CLASSIFY_DECIDED ×3 | PASS | pm | telemetry rich (path, classification_id, block_reason) |
| WORK_ORDER_ANALYZED | PASS | pm | `item_count=3` |
| ITEM_REVIEWED + CLASSIFY_REVIEWED | PASS | coder | final_complexity_id, final_level_code |
| WORK_ORDER_FINALIZED | PASS | pm | `item_count`, `production_task_count` |
| WORK_ORDER_PRODUCTION | PASS | — | user_id NULL (see gap) |
| PRODUCTION_TASK_COMPLETED | PASS | coder | entity + task code + link |
| DOCUMENTS_UPLOADED | PASS | coder | `count=1` |
| WORK_ORDER_COMPLETED (doc trigger) | PASS | coder | trigger = document_upload |

Classification decider during this run: 1 item → CODER_REVIEW (block reason `MARGIN_BELOW_FLOOR`), confirming the review path and its audit rows.

**Not covered by this probe:** login (gap, below); `USER_*` admin events (verified by code read: `USER_CREATED/UPDATED/PASSWORD_RESET/USER_PASSWORD_CHANGED` in userService); `WORK_ORDER_STATUS_ROLLED_BACK`, `WORK_ORDER_UPDATED`, `PRODUCTION_TASK_REOPENED`, `WORK_ORDER_ACCESS_REVOKED` (mode-verified in `stateFallbackSmoke.js` not present — flagged for a future pass if needed; low risk, same auditService path).

## /api/audit-log contract — verified
- Envelope `total` == SQL count with same WO filter.
- Rows carry joined identity (`user_name`/`wo_number`/`item_number`).
- Readable by all roles (ADMIN/PM/CODER); unauthenticated → 401.
- Error paths: bad `date_from` → 400; bad `user_id` → 400.
- `action` filter exact; `search` by wo_number finds the create row; paging stable (`total` constant, bounded rows).
- Performance: `auditLogRepository.findAll` uses `COUNT(*) OVER()` single-pass — no pagination N+1 (design note).

## Gaps → fixed (2026-09-21)

1. **Work-order audit linkage (fixed).** `CLASSIFY_DECIDED`, `WORK_ORDER_FINALIZED`, `WORK_ORDER_PRODUCTION` rows now carry the `work_order_id` column (`workOrderService.js`). The audit-log WO filter/search now includes all three previously-lossy actions. Verified by harness (`finalized/production/decided work_order_id linked` all PASS).
2. **Lost actor on production/completion (fixed).** `workOrderController.js` now passes `user_id: req.user.id` to `startProduction`/`completeProduction`; the service writes the real actor instead of `null`. Verified: `production user_id captured` (actor = initiating coder), completion rows carry actor.
3. **Login events never audited (fixed).** Implemented in `authService.login()`:
   - **200 success** → `USER_LOGIN`, `user_id` + `ip_address` only (per spec).
   - **401 unknown identifier** → `LOGIN_FAILED`, `user_id` NULL, `details {identifier, reason:'invalid_credentials'}`, ip.
   - **401 wrong password** → `LOGIN_FAILED`, `user_id` = resolved user, same details shape.
   - **403 deactivated account** → `LOGIN_FAILED`, `user_id` = user, `reason:'deactivated'`.
   - **400 validation** (`validateLogin` rejects missing/invalid fields) → **intentionally not audited** (per spec).
   - Password is never logged; `auditService.log` is fire-and-forget so audit can't mask the thrown error.
   - No DB schema change; `findActions()` auto-exposes `USER_LOGIN`/`LOGIN_FAILED` in the audit-log UI. The LEFT JOIN shows `user_name` for resolved actors, null for unknown-identifier attempts.
   - Harness verified all branches (63 PASS / 0 FAIL): success row, 401+null-user, 401+resolved-user, 403+deactivated, validation-400 silent, scratch-user lifecycle, cleanup.

## Remaining observations (report-only, out of scope)
- `?token=` / `/auth/me` session restoration is not a credential login → not audited; tokens require a successful login to mint.
- No `trust proxy` → `req.ip` is the socket address; behind a real reverse proxy all rows record the proxy IP.
- `/api/health` is static (no DB/embedder ping); dashboard health literals hard-coded `online`; no request-log/metrics (unchanged from initial scope).

## Observability findings (report-only)
- **`/api/health` is static** — returns `{ success, time }`, no DB connectivity or classifier/embedder ping. A deployment with a dead DB or 500-ing embedder still reports healthy.
- **Admin dashboard health block hard-codes `'online'`** for both `health.api` and `health.database` (`adminDashboardService.js:38-39`). Shows green regardless of actual backend/db state.
- **No request-logging middleware / no metrics endpoint** — deps list has no morgan/pino/winston; nothing logs request volume, latency, or error rates.
- **Perf envelope** from smoke: `/api/analyze` ~1.6s for 3 items (semantic embed ~1.4s, hit when model warm) — load-bearing observation only; no threshold asserted.
- **Classification telemetry script** (`backend/scripts/score-semantic-telemetry.js`) runs cleanly (read-only), reported 8 decided events, wrong-rate 0.0%, thresholds pass. Note: `MARGIN_BELOW_FLOOR` blocks from scratch probes inflate the block-reason histogram — fine for a dev DB.

## Env / cleanup state
- Backend stopped after run; `backend/.env` untouched (`SEMANTIC_ENABLED=1`).
- Scratch rows purged in-run: users=5 restored, 0 `AUD-*` work orders left, scratch audit rows wiped (FK-safe, `audit_trail` rows deleted before work orders per `audit_trail.user_id` FK note).
- Note: `kb_items` count drifted 29→30 during this task's runs (a learned `KB-CODER-*` row from an earlier aborted probe). Not a regression from the final green run — cleanup conservatively targets only surviving scratch item ids; could not fully reconcile the earlier crash trajectory.