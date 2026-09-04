# PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-03
**Branch:** main (verify with `git branch --show-current`)

## OVERVIEW
Firmware custom-item classification & estimation system. Express + PostgreSQL backend, Vite + React frontend, role-based access (PM / CODER / ADMIN).

## STRUCTURE
```
./
├── backend/        # Express API (port 5000), layered: routes→controllers→services→repositories
├── frontend/       # Vite + React SPA (port 5173, /api proxied to :5000)
├── database/       # schema.sql + alter/index migrations (4 files, apply manually)
├── reports/        # QA/QC reports (*.md)
└── tempLiveTest/   # live smoke-test harness (re-runnable scripts + reports)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| API endpoint behavior | `backend/src/routes/*` + `services/*` | services own business rules |
| DB schema / columns | `database/schema.sql` | source of truth before writing queries |
| Page behavior | `frontend/src/pages/X.jsx` + `useX.js` | logic lives in the hook, not the JSX |
| Auth / roles | `backend/src/middleware/auth.js` | ADMIN bypasses every `authorize()` |
| Past QA findings | `reports/`, `tempLiveTest/*-report.md` | check before re-probing known bugs |

## CONVENTIONS
- API envelope is always `{ success, message, data }`; errors via `ApiError(status, msg)` → centralized `errorHandler`.
- Usernames/emails stored lowercase; roles are code strings `PM` / `CODER` / `ADMIN`.
- No test runner, no linter. Verification = `node --check` + live scripts against `localhost:5000`.

## ANTI-PATTERNS (THIS PROJECT)
- Never assert notifications immediately after grant/revoke/finalize — `notify()` is fire-and-forget; poll settled DB state instead.
- Never leave scratch rows behind — every live script must wipe its users/roles/audit/notifications and re-verify baseline counts.
- Never delete a user before its `audit_trail` rows (`audit_trail.user_id` FK blocks it).

## COMMANDS
```bash
# backend (from backend/)
node src/server.js          # start API (:5000, needs .env — see .env.example)
node --check src/services/userService.js   # syntax check (no linter exists)

# frontend (from frontend/)
node node_modules/vite/bin/vite.js --port 5173  # dev server
npm run build               # production build
```

## NOTES
- Backend `.env` holds PG credentials + `JWT_SECRET`; never commit it.
- Seed/demo accounts: `admin@demo.com` / `pm@demo.com` / `coder@demo.com` (password `password123`); user count baseline is 4.
- Frontend login accepts `?token=` query param (documented leak surface, not a bug to "fix" silently).
