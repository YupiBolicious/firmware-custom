# BACKEND KNOWLEDGE BASE

## OVERVIEW
Express 4 + `pg` API. Strict layering: routes → controllers → services → repositories.

## STRUCTURE
```
src/
├── app.js            # route mounting (/api/*), 404 + errorHandler last
├── server.js         # listen entry (PORT, default 5000)
├── routes/           # thin: authenticate → authorize(...roles) → controller
├── controllers/      # req/res mapping only, try/catch → next(err)
├── services/         # business rules, throw ApiError; audit via auditService.log
├── repositories/     # raw SQL via pool; transactions with client BEGIN/COMMIT/ROLLBACK
├── validators/       # validateXCreate/Update → 400 on failure
├── middleware/       # auth.js, errorHandler.js (ApiError + PG-code map), validateParams.js
└── config/db.js      # pg pool (PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Who may call an endpoint | route file `authorize(...)` + service `assertCan*` | both layers enforce; check both |
| Status-code contract | service `throw new ApiError(4xx, ...)` | 400 validation, 403 permission, 404 missing, 409 dup |
| PG error mapping | `middleware/errorHandler.js` PG_ERROR_MAP | e.g. 22008/23505 → 400/409, not 500 |
| Cross-user checks | `services/*Service.js` `assertCan*` | list paths must enforce too (past IDOR) |

## CONVENTIONS
- `authorize('ADMIN')` is redundant-but-harmless: ADMIN bypasses any role list (`/* SU for Admin */`).
- `authenticate` accepts `Authorization: Bearer` or `?token=`; deactivated users get 403, not 401.
- `updateWithRoles`-style writes run in explicit transactions; read-then-write guards (e.g. last-admin checks) live in services, not repositories.
- Audit logging must never break the main flow (see `auditService.js`).

## ANTI-PATTERNS (THIS PROJECT)
- No `updated_at` on some tables (e.g. `machine_model`) — check `schema.sql` before adding timestamp writes.
- `findByCode`-style lookups may ignore `is_active` — deactivated rows still collide on unique codes (documented, don't "fix" silently).
- `notificationService.notify()` is not awaited by callers — never treat API 200 as "notifications persisted".

## COMMANDS
```bash
node src/server.js
node --check src/services/<name>.js
```
