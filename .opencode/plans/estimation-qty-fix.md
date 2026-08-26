# Plan: Estimation hours × quantity fix

Status: APPROVED. Execution blocked by permission config (`edit * -> deny`). Re-run when edit permission granted.

## Goal
`item_estimations` stores raw per-unit hours (audit trail). Quantity is multiplied at display/storage-query level. No DB migration.

## File changes

### 1. workOrderService.js — analyzeWorkOrder (:285)
Add `quantity: item.quantity` to results array. `item.quantity` already exists from `findItemsByWorkOrderId` query.
```diff
      status: classification.status,
      estimated_hours: estimation ? Number(estimation.total_hours) : null,
+     quantity: item.quantity,
```

### 2. workOrderService.js — buildSummary (:364)
Multiply in summary total using quantity carried in results.
```diff
- const totalEstimatedHours = results.reduce((sum, r) => sum + (r.estimated_hours || 0), 0);
+ const totalEstimatedHours = results.reduce((sum, r) => sum + (r.estimated_hours || 0) * (r.quantity || 1), 0);
```

### 3. workOrderService.js — reviewItem return (:76)
Multiply level hours by item.quantity (available via `findItemWithWorkOrder` / `woi.*`).
```diff
-    estimated_hours: isFirmware ? Number(level.total_hours) : null,
+    estimated_hours: isFirmware ? Number(level.total_hours) * (item.quantity || 1) : null,
```

### 4. workOrderRepository.js — findAll (:10)
SQL-level multiply in work order list aggregate.
```diff
-            COALESCE(SUM(ie.total_hours), 0) AS total_estimated_hours
+            COALESCE(SUM(ie.total_hours * woi.quantity), 0) AS total_estimated_hours
```

### 5. dashboardService.js — getDashboard (:9)
Dashboard has no direct access to woi.quantity — needs JOIN.
```diff
-   pool.query(`SELECT COALESCE(SUM(total_hours), 0) AS total FROM item_estimations`),
+   pool.query(`SELECT COALESCE(SUM(ie.total_hours * woi.quantity), 0) AS total FROM item_estimations ie JOIN work_order_items woi ON woi.id = ie.work_order_item_id`),
```

### Unchanged
- `estimationService.js` — stays per-unit (canonical audit value)
- `item_estimations` schema — no migration
- `WorkOrderDetail.jsx` — frontend receives already-multiplied `estimated_hours` from analyze response

## Verification
1. `node --check` on workOrderService, workOrderRepository, dashboardService
2. `vite build` (frontend unchanged but verify no regressions)
3. Manual: WO with ITEM-001 (qty=1, L2=10h) + ITEM-004 (qty=3, L1=6h) → summary = 10 + 18 = 28h; dashboard total matches; work order list total matches
