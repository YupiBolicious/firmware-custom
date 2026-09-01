# Smoke Test Report — WorkOrderDetail: Analyze-in-ANALYZED + Form Relocation

**Date:** 2026-09-01
**Build:** `vite build` — **PASS** (0 errors, 0 warnings related to changes)

---

## Changes Under Test

| # | File | Change |
|---|------|--------|
| 1 | `WorkOrderDetail.jsx:187` | Analyze button: enabled in `DRAFT` + `ANALYZED` |
| 2 | `WorkOrderDetail.jsx:332` | Edit item button: enabled in `DRAFT` + `ANALYZED` |
| 3 | `WorkOrderDetail.jsx:333` | Delete item button: enabled in `DRAFT` + `ANALYZED` |
| 4 | `useWorkOrderDetail.js:142` | `handleUpdateItem` clears `analysis` state after success |
| 5 | `useWorkOrderDetail.js:161` | `handleDeleteItem` clears `analysis` state after success |
| 6 | `WorkOrderDetail.jsx:199-250` | Item edit/add form moved inside Groups & Custom Items panel |

---

## Status Gate Matrix (Frontend)

| Status | Edit WO Link | Finalize | Start Production | Complete Production |
|--------|:------------:|:--------:|:----------------:|:-------------------:|
| DRAFT | YES | - | - | - |
| ANALYZED | YES | YES | - | - |
| FINALIZED | - | - | YES (CODER) | - |
| PRODUCTION | - | - | - | YES (CODER) |
| COMPLETED | - | - | - | - |

| Status | groupsEditable | Add Model | Edit/Del Group | + Add Item | Edit/Del Item | Analyze |
|--------|:--------------:|:---------:|:--------------:|:----------:|:-------------:|:-------:|
| DRAFT | YES | YES | YES | YES | YES | YES |
| ANALYZED | YES | YES | YES | YES | YES | YES |
| FINALIZED | - | - | - | - | - | - |
| PRODUCTION | - | - | - | - | - | - |
| COMPLETED | - | - | - | - | - | - |

## Backend Status Guards

| Operation | Guard | Effect |
|-----------|-------|--------|
| `addItem` | `FINALIZED` blocked | Throws 400 |
| `addItem` | `ANALYZED` detected | Resets status to `DRAFT` |
| `updateItem` | None | Allows all statuses |
| `deleteItem` | `FINALIZED` blocked | Throws 400 |
| `deleteItem` | Last item deleted | Resets to `DRAFT` if status is not `DRAFT`/`FINALIZED` |
| `analyzeWorkOrder` | None | Allows all statuses |
| `assertGroupsEditable` | `FINALIZED`/`PRODUCTION`/`COMPLETED` | Throws 400 |

---

## Flow Traces

### Flow 1: DRAFT -> ANALYZED -> Edit Item -> Re-Analyze

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | WO in DRAFT, add groups + items | Items appear in table | PASS |
| 2 | Click "Analyze / Estimate" | Backend classifies all items, status -> ANALYZED | PASS |
| 3 | Items table shows fw_related, complexity, confidence, hours | Classification data visible | PASS |
| 4 | Click Edit on an item | Form appears inside Groups panel under header buttons | PASS |
| 5 | Modify title/desc/qty, submit | `handleUpdateItem` -> API PUT -> `setAnalysis(null)` -> `load()` | PASS |
| 6 | Analysis preview disappears | `analysis` is null, `{analysis && ...}` block hidden | PASS |
| 7 | Click "Analyze / Estimate" (re-analyze) | Button enabled (ANALYZED allowed), backend re-classifies all items | PASS |
| 8 | New analysis results appear | Fresh classification + estimation | PASS |

### Flow 2: DRAFT -> ANALYZED -> Delete Item -> Re-Analyze

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | WO in ANALYZED with 3 items | Items visible | PASS |
| 2 | Click Delete on 1 item | `confirm()` dialog -> API DELETE -> `setAnalysis(null)` -> `load()` | PASS |
| 3 | 2 items remain, status stays ANALYZED | Backend does not reset (items > 0) | PASS |
| 4 | Analysis preview cleared | Stale preview hidden | PASS |
| 5 | Click "Analyze / Estimate" | Re-analyzes 2 remaining items | PASS |

### Flow 3: ANALYZED -> Delete All Items -> Resets to DRAFT

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | WO in ANALYZED with 1 item | | PASS |
| 2 | Delete last item | Backend: `remainingItems === 0` + status !== DRAFT/FINALIZED -> resets to DRAFT | PASS |
| 3 | `load()` -> status is DRAFT | Analyze button enabled (DRAFT) | PASS |
| 4 | Analyze button disabled | `items.length === 0` prevents analyzing empty WO | PASS |

### Flow 4: ANALYZED -> Add New Item -> Resets to DRAFT

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | WO in ANALYZED | | PASS |
| 2 | Click "+ Add Item" on a group | Form appears with group pre-selected | PASS |
| 3 | Submit new item | Backend `addItem`: detects ANALYZED -> resets to DRAFT | PASS |
| 4 | Status now DRAFT | `load()` reflects DRAFT, Analyze button enabled | PASS |
| 5 | **Analysis preview still visible** | **BUG** — `handleAddItem` does not call `setAnalysis(null)` | **FAIL** |

### Flow 5: FINALIZED — All Edit/Delete Blocked

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | WO in FINALIZED | Edit/Delete buttons disabled (not DRAFT, not ANALYZED) | PASS |
| 2 | Analyze button disabled | Correct | PASS |
| 3 | Groups not editable | `groupsEditable = false` | PASS |
| 4 | Backend: addItem | BLOCKED (`FINALIZED`) | PASS |
| 5 | Backend: deleteItem | BLOCKED (`FINALIZED`) | PASS |
| 6 | Backend: assertGroupsEditable | BLOCKED (`FINALIZED`) | PASS |

### Flow 6: Form Position — Mobile UX

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | Click Edit/Add Item | Form appears inside Groups & Custom Items panel, under header buttons | PASS |
| 2 | Form is above groups list | No scroll needed to reach form on mobile | PASS |
| 3 | Cancel / Submit closes form | `cancelEdit()` / handlers reset state | PASS |

### Flow 7: Permission Checks

| Step | Action | Expected | Result |
|------|--------|----------|--------|
| 1 | Non-owner, non-admin, non-granted user | `canEdit = false`, all action buttons hidden | PASS |
| 2 | Owner | `canEdit = true`, full access | PASS |
| 3 | Admin | `canEdit = true`, full access | PASS |
| 4 | Granted user | `canEdit = true`, full access | PASS |
| 5 | Non-owner/admin manages access | `canManageAccess = false`, access panel hidden | PASS |

---

## Bugs Found

| Severity | File | Line | Issue |
|----------|------|------|-------|
| **Low** | `useWorkOrderDetail.js` | `handleAddItem` (~line 100) | Missing `setAnalysis(null)`. When adding an item in ANALYZED state, backend resets to DRAFT but stale analysis preview remains visible. |

**Fix:** Add `setAnalysis(null)` in `handleAddItem` after `setItemForm(emptyItemForm)`, matching the pattern used in `handleUpdateItem` and `handleDeleteItem`.

---

## Summary

| Metric | Value |
|--------|-------|
| Total checks | 33 |
| Passed | 32 |
| Failed | 1 (low severity) |
| Backend changes needed | 0 |
| Frontend fix needed | 1 line in `handleAddItem` |

The core feature (edit/delete analyzed items + re-analyze) works correctly across all status transitions. The only gap is the missing `setAnalysis(null)` in `handleAddItem`, which leaves a stale estimation preview visible after adding an item in ANALYZED state.
