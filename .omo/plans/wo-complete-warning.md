# Work plan: warn on document-less production completion (no block)

## TODOs
1. [x] Implement `completed_without_documents` flag in `completeProduction` (+ audit details)
2. [x] Verify live (warn without docs, clean with docs, task gate intact) + full scratch cleanup

## Decision
Warn-don't-block. Some complexity levels don't require docs, and production-task
gating already covers the Complete button — so completion proceeds, but a
zero-document completion is flagged in the response and the audit trail.

## Edit 1 — `backend/src/services/workOrderService.js`
1. Add import (after the `workOrderAccessRepository` require, ~line 3):
   `const documentRepository = require('../repositories/documentRepository');`
2. In `completeProduction` (~line 609), after the `open > 0` task check, insert:
   `const documentCount = await documentRepository.countByWorkOrderId(id);`
   `const completedWithoutDocuments = documentCount === 0;`
3. Extend the `WORK_ORDER_COMPLETED` audit details with
   `document_count: documentCount, completed_without_documents: completedWithoutDocuments`.
4. Change the return from `return updated;` to
   `return { ...updated, completed_without_documents: completedWithoutDocuments };`
   (Controller passes service result straight into `data`; no controller change needed.
   Frontend may banner on `data.completed_without_documents` — optional follow-up, out of scope.)

## Edit 2 — none (controller/frontend untouched by design)

## Verify
1. `node --check backend/src/services/workOrderService.js`.
2. Restart backend (`node src/server.js` from `backend/`).
3. Live script (scratch WO driven FINALIZED→PRODUCTION→complete, then wipe it):
   - Complete with zero documents → 200, `data.completed_without_documents === true`,
     audit `WORK_ORDER_COMPLETED` details carry `document_count: 0`.
   - Upload a doc first, complete → 200, flag `false`.
   - Tasks still gate: complete with open tasks → 400 (unchanged).
   - Cleanup: delete scratch WO + its documents/tasks/audit/notifications; verify
     baselines (users = 4, WO-21 DRAFT + 0 grants).
4. Frontend `npm run build` (no frontend changes expected, sanity only).

## Accepted behavior
- Zero-doc completion succeeds (warning only). Task gating unchanged.

## Reversal (user request — flag "doesnt work")
Reverted: `completed_without_documents` removed from `completeProduction`
(import, doc count, audit fields, spread return all restored to base).
Verified by `tempLiveTest/_verify_revert.js` (7/7: gate 400 intact, zero-doc
complete 200 with no flag key, base-shape audit, full wipe, baselines intact).
`_verify_wowarn.js` is superseded (asserts the removed flag) — kept as history.

## Drop (user request — remove every change from this plan)
Code verified clean: zero `completed_without_documents` / `documentCount` /
`documentRepository` references remain in `workOrderService.js` (grep scan).
Remaining uncommitted diff in that file predates this plan (rollback logic,
`assertItemsEditable`, IDOR list guard — kept). Stale `_verify_wowarn.js`
deleted; `_verify_revert.js` kept as proof of base behavior. Backend healthy.
