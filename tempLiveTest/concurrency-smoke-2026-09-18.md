# Concurrency / Duplicate-Submit Smoke — 2026-09-18

## Result
**59 PASS / 0 FAIL / 0 SKIP** (`SMOKE_EXIT=0`) across 3 runs (backend :5000 + Vite :5173).

| Scope | Results |
|-------|---------|
| Backend concurrency script (`tempLiveTest/concurrencySmoke.js`) | 59/59 |
| Frontend SPA root `/` | 200, hasRoot |
| Frontend `/login` | 200, hasRoot |
| Vite→backend proxy `POST /api/auth/login` | 200, hasToken |

## What was validated
Post-hardening concurrency posture. The script drives scratch work orders (A/B/C) through the full state machine and fires **concurrent** duplicate requests at each guarded transition, then asserts settled DB state (no dup rows, correct final status, baselines intact).

Specific guards exercised, all with {two fired, exact-one-wins}:
- **dup WO create** → `201 + 409`, exactly 1 row (both pre-check and `23505` paths).
- **double analyze** → `200 + 200` (idempotent), 1 classification/item, 0 duplicate `classification_matches` (new `uq_classification_matches_entity` index).
- **double finalize** → `200 + 409` (run 1) / `200 + 200` (idempotent early-return, run 3), 1 `production_task`/item. WO lands `FINALIZED`.
- **double startProduction** → exactly one `200`, other `400/409` (conditional `updateStatus WHERE status='FINALIZED'`). Lands `PRODUCTION`.
- **double completeProduction** → exactly one `200`, other `400/409`; WO lands `COMPLETED`. The manual-complete path was reachable via the `complexity_level_id=NULL` fixture (upload auto-complete is the other route, covered by WO C).
- **task toggle after COMPLETED** → blocked with 4xx (409 or 400 `"Work order must be in production to update tasks"`).
- **double review** → exactly one `200`, other `400`/`409`; single estimation row, `reviewed_by` set; re-analyze after review OK.
- **dup grant/access** → non-5xx, exactly 1 `work_order_access` row.
- **doc upload auto-complete** PRODUCTION → `201` + WO lands `COMPLETED`; documents list shows the file.
- **DDL shipped**: `uq_classification_matches_entity` present; `work_order_access (work_order_id, user_id)` unique pair present.
- **11 page-surface endpoints** (pm/coder/admin) all 200 + notification unread-count shape.
- **Cleanup**: user count restored, 0 scratch `SMOKE-%` WOs left, 0 duplicate `classification_matches` globally.

## Issues found & fixed (during smoke bring-up, no product-code impact)
1. **Hardcoded `machine_model_id:1` in the harness didn't exist** in the live DB (real ids 25-29). Script now resolves a model/version dynamically. This caused the first all-400 FAIL cascade, not a backend bug.
2. **Review double-submit legitimately returns `400`** (read-guard `api/work-orders/items/:id/review` when loser reads after commit) not only `409` (conditional-update path). Both observed; both are correct client errors. Assertion widened to `{400,409}`.
3. **Task-toggle-after-COMPLETED blocks with `400`** `"Work order must be in production to update tasks"`, not 409. Assertion widened to any 4xx.
4. **`finalize` blocks on unresolved items** (`decider` returns `CODER_REVIEW` whenever any KB similarity ≥0.35 shadows the rule tier — e.g. `'Change alarm setpoint configuration'` → 48% vs learned `KB-1006`). Script self-heals: sequentially fills any `CODER_REVIEW` leftovers as coder, then asserts all resolved. This is why static seeded titles stopped auto-resolving.

## Environment notes
- Live `users` count is **5**, not 4 as in AGENTS.md — pre-existing leftovers `pm@test` (id 16) and `admin@test` (id 47). Not touched; script asserts count preserved dynamically.
- **Coder-review path teaches the live corpus** (`kb_items` row `KB-CODER-<scratchItemId>` per reviewed item, no FK cascade). Prior harness runs leaked these, drifting similarity outcomes. `concurrencySmoke.js` now **deletes the learned rows it creates** so the corpus is stable across runs.
- A/B/C scratch rows are fully cleaned (audit_trail → notifications → classifications → estimations → tasks → docs → access → items → groups → WOs → learned KB rows), verified by the 3 cleanup PASS lines.
- Harness changes are confined to `tempLiveTest/concurrencySmoke.js`. Product-code hardening validated by this smoke (already applied, uncommitted): `database/alter_match_concurrency.sql` dedupe + unique index, gated `updateStatus(.., fromStatus)` + gated `completeProductionTask` (workOrderRepository), 409 mapping in workOrderService, gated doc-upload auto-complete (documentService), `ON CONFLICT DO NOTHING` in classificationRepository, and the frontend 409-refresh in `useWorkOrderDetail.js`.