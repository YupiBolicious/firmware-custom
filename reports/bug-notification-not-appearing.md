# Bug Report — Notification not appearing (Access granted / 前端不显示通知)

- **Date:** 2026-09-01
- **Severity:** Medium (feature partially non-functional)
- **Status:** Root cause identified; verified working after restart. Frontend verification outstanding.
- **Reporter:** PM (manual bug report request)

---

## Summary

When access to a Work Order is granted, the intended in-app notification (bell) was **not appearing** in the frontend even though the backend audit entry for the grant was written. Manual investigation traced the failure to a **stale backend process**, not to the notification feature code itself.

---

## Steps to reproduce

1. Log in as a PM (owner of a Work Order).
2. Open the Work Order and grant access to another user (Shared Access panel).
3. Check the grantee's (and/or owner's) notification bell — expected an `ACCESS_GRANTED` notification.
4. **Observed:** no notification row is produced; the grant itself succeeds (HTTP 200).

Reproduction was done against the backend process that was running at the time the symptom was reported.

---

## Expected behaviour

- On `grantWorkOrderAccess`, backend inserts a `notifications` row for the recipient (`status = 'ACCESS_GRANTED'`, message e.g. `You can now edit <wo_number>`).
- The frontend bell (polling `/api/notifications` + `/api/notifications/unread-count` every 30s) shows the notification with an unread badge.

## Actual behaviour (during report)

- Grant API returned **HTTP 200** and the `audit_trail` row `WORK_ORDER_ACCESS_GRANTED` was written.
- **No** `notifications` row was inserted — the bell stayed empty.

---

## Root cause

**Stale backend process serving stale code.**

Multiple `node server.js` processes had been running (from earlier manual restarts). Requests were being served by an **older process that did not include** the notification trigger code added to `backend/src/services/workOrderService.js` (the `notificationService.notify(...)` calls inside `grantWorkOrderAccess` / `revokeWorkOrderAccess`, and the `notifyWorkOrderRecipients(...)` helper used by finalize/complete).

- The old process still had the `grantWorkOrderAccess` audit line, so the **audit** row was written — but it lacked the **notify** calls, so no notification row appeared.
- Because `notificationService.notify` is intentionally fire-and-forget (its errors are swallowed with `console.error('Notification send failed: ...')`), the failure was invisible in HTTP responses — adding to the confusion.

This is not a logic bug in the notification code; it is an environment/deployment issue (running server not updated with latest source).

---

## Evidence

Reproduction after killing all stale `server.js` processes and starting **one** fresh backend with redirected logs:

```
grant status 200 (work_order_id=20, user_id=33, granted_by=32)
notification rows:
  {"id":"15","user_id":33,"status":"ACCESS_GRANTED","message":"You can now edit REPROWO","entity_id":20}   <- grantee
  {"id":"16","user_id":32,"status":"ACCESS_GRANTED","message":"REPROWO editting is now shared...","entity_id":20} <- owner
last grant audit: {"id":129,"user_id":32,"action":"WORK_ORDER_ACCESS_GRANTED"}
server.err.log: (empty — no "Notification send failed")
```

**Conclusion:** with the current code, **both** the grantee and the owner receive an `ACCESS_GRANTED` notification correctly. The earlier "no notification" symptom was caused by the live server running older code.

---

## Related decision note (product scope)

- Verification shows the owner notification is **not** buggy (it inserts correctly). There is no owner-grant defect to remove.
- Whether to notify the owner on grant/revoke is therefore a **product decision**, not a bug fix.
- The current implementation notifies **grantee + owner** for grant, and **grantee + owner** for revoke.

---

## Files affected

- `backend/src/services/workOrderService.js` — notify trigger calls in `grantWorkOrderAccess` (~L553), `revokeWorkOrderAccess` (~L590), `finalizeWorkOrder` / `completeProduction` via `notifyWorkOrderRecipients` (~L89).
- `backend/src/services/notificationService.js` — `notify(...)` (fire-and-forget).
- `backend/src/repositories/notificationRepository.js` — `create(...)` (INSERT into `notifications`).
- `backend/src/controllers/notificationController.js`, `backend/src/routes/notificationRoutes.js`, `backend/src/app.js` — notification API (`GET /api/notifications`, `/unread-count`, `/mark-all-read`, `POST /:id/read`).
- Table `notifications` (columns: `id, user_id, status, message, entity_id, is_read, created_at` — `created_at` is LOCAL `TIMESTAMP DEFAULT NOW()`).
- `frontend/src/pages/useNotifications.js` (30s poll), `frontend/src/components/NotificationBell.jsx`, `frontend/src/components/Layout.jsx` (top-right bell).

---

## Resolution / verification needed

1. **Done:** restart backend from current source (single `node src/server.js`); confirmed grant produces notifications for both recipients; error log clean.
2. **Pending (frontend, live):** log back in and confirm the bell shows the `ACCESS_GRANTED` notification and unread badge, and that opening it navigates to the Work Order.

---

## Recommendations

1. Always restart the backend (**and** frontend dev server) after editing `backend/src/*` — a running `node server.js` does not reload source. Use `nodemon`/`--watch` for local dev to avoid stale-process bugs.
2. Consider making `notify` failures at least log the stack (or surface a non-fatal warning) so silent notification drops are easier to diagnose.
3. Confirm the intended recipient policy (grantee-only vs grantee+owner) for grant/revoke before finalizing UI acceptance.
