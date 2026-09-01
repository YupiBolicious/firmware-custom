# Notification Flow Report

- **Date:** 2026-09-01
- **Status:** Current as of this session (supersedes earlier smoke/bug reports)
- **Scope:** Event-driven in-app notification flow, including the new "Complete Production" route and username-instead-of-user_id message change.

---

## 1. Data model — `notifications` table

Columns:

| Column | Type |
| --- | --- |
| `id` | bigint (PK, BIGSERIAL) |
| `user_id` | integer (FK → `users`, ON DELETE CASCADE) |
| `status` | varchar(50) |
| `message` | text |
| `entity_id` | integer |
| `is_read` | boolean, default `false` |
| `created_at` | timestamp (LOCAL, `DEFAULT NOW()`) |

- Index: `idx_notifications_user (user_id, is_read, created_at DESC)`.
- **No `user_name` column** — usernames are embedded in `message` text (keeps fields minimal).

---

## 2. Event-driven triggers

All trigger logic lives in `backend/src/services/workOrderService.js`. `notificationService.notify(...)` is fire-and-forget (its failures are logged, never thrown).

### ACCESS_GRANTED — `grantWorkOrderAccess`
- **Grantee:** `You can now edit {wo_number}`
- **Owner:** `{wo_number} editting is now shared with {username}`  ← username, not `user id N`
- Recipients: **grantee + owner**

### ACCESS_REVOKED — `revokeWorkOrderAccess`
- **Grantee:** `Your access to {wo_number} was revoked`
- **Owner:** `{username} no longer has access to {wo_number}`  ← username (falls back to `user id N` only if the user lookup fails)
- Recipients: **grantee + owner**

### WO_FINALIZED — `finalizeWorkOrder`
- Via `notifyWorkOrderRecipients` (owner + all granted users)
- Message: `{wo_number} has been finalized`

### WO_COMPLETED — `completeProduction`
- Via `notifyWorkOrderRecipients` (owner + all granted users)
- Message: `{wo_number} has been completed`
- Now reachable in-app via the new route (see §3).

---

## 3. Access points (routes)

Backend (`backend/src/routes/workOrderRoutes.js`, all behind `authenticate`):

| Method / Path | Action | Role |
| --- | --- | --- |
| `POST /api/work-orders/:id/production` | Start production | CODER |
| `POST /api/work-orders/:id/production/complete` | **Complete production (NEW)** | CODER |
| `POST /api/work-orders/:id/finalize` | Finalize | PM |
| `POST /api/work-orders/:id/access` | Grant access | PM |
| `DELETE /api/work-orders/:id/access/:userId` | Revoke access | PM |
| `GET /api/notifications` | List my notifications | authenticated |
| `GET /api/notifications/unread-count` | Unread count | authenticated |
| `POST /api/notifications/mark-all-read` | Mark all read | authenticated |
| `POST /api/notifications/:id/read` | Mark one read | authenticated |

Note: global ADMIN bypass in `auth.js` permits admins on all roles.

---

## 4. Frontend

- **Bell:** `frontend/src/components/NotificationBell.jsx` renders each notification's `message` and local time (`dd/MM hh:mm`). Unread dot on unread items; badge shows unread count. Clicking an item marks it read and navigates to `/work-orders/{entity_id}`.
- **Polling:** `frontend/src/pages/useNotifications.js` polls `/notifications` + `/unread-count` every 30s.
- **Header:** bell mounted top-right in `frontend/src/components/Layout.jsx` ; `.notif-*` styles in `frontend/src/index.css`.
- **Complete Production (NEW):** `WorkOrderDetail.jsx` shows a **"Complete Production"** button for CODERs when status = `PRODUCTION`, wired to `handleCompleteProduction` (in `useWorkOrderDetail.js`) → `POST /work-orders/:id/production/complete`, then reloads.

---

## 5. Bugs fixed this session

### A. `notificationRepository.create` was broken (code-level root cause)
The INSERT had **5 placeholders `$1..$5` but only 4 target columns**, i.e.:

```sql
INSERT INTO notifications (user_id, status, message, entity_id)
VALUES ($1, $2, $3, $4, $5)   -- 4 columns, 5 placeholders
```

This threw `INSERT has more expressions than target columns` on **every** insert, silently dropped by `notify`'s try/catch — meaning notifications could fail even though the code "looked" correct. Caused by an unfinished `user_name` param.

**Fix:** removed the phantom `user_name` parameter; `create` now inserts 4 values correctly. Verified: probe insert succeeded (id 25), then cleaned up.

### B. Earlier "no notification on access granted" (environmental)
Tracing first showed a **stale backend process** (an old `node server.js` serving code without the trigger calls) wrote the audit row but skipped the notify. Root cause: running server predates the source. Notification feature verified working after a clean single-process restart.

---

## 6. Verified behavior / evidence

- `notificationRepository.create` probe insert succeeded (id 25) and was cleaned up; no residual rows.
- Grant flow inserts rows for **grantee + owner**; error log empty.
- Backend restarted from current source after changes; `/api/health` OK.

---

## 7. Notes / decisions

- Recipient policy is **grantee + owner** for grant/revoke (kept as-is per instruction).
- Usernames shown in `message` text rather than a dedicated column.
- WO_COMPLETED now reachable in-app via the new `/production/complete` route + UI button (previously service-only / dead code).
- Recommendation: always restart the backend (and Vite) after editing `backend/src/*` — a running `node server.js` does not hot-reload; use `nodemon`/`--watch` for dev to avoid stale-process issues.
