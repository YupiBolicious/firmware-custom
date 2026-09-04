# FRONTEND KNOWLEDGE BASE

## OVERVIEW
Vite 5 + React 18 SPA. Pages pair a `X.jsx` view with a `useX.js` data hook; all API calls live in hooks.

## STRUCTURE
```
src/
├── api/client.js     # axios baseURL '/api', Bearer from localStorage, global 401 → wipe + /login
├── context/          # useAuth() — user, hasRole()
├── pages/            # X.jsx + useX.js pairs (28 files)
├── components/       # shared UI (6 files)
└── App.jsx           # routes + RoleRoute guards
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Data fetching / mutations | `pages/useX.js` | `api.get/post/put/delete(...)` calls |
| Page access control | `App.jsx` RoleRoute + `isAdmin` gating in page | two layers; KB/complexity rely on page-level gating + backend 403 |
| Auth state | `context/` `useAuth()` / `hasRole()` | |
| API error display | `alert alert-error` banner per page | every page must render hook `error`, never crash on 403 |

## CONVENTIONS
- Mutations hidden behind `isAdmin = hasRole('ADMIN')`; list views stay visible, backend 403 surfaces as banner.
- No test runner. Smoke = `npm run build` + serve :5173 + verify `/api` proxy reaches backend.

## COMMANDS
```bash
npm run build
node node_modules/vite/bin/vite.js --port 5173
```
