# User Management Smoke Test Report

- **Date:** 2026-08-31
- **Scope:** Authentication (login by email/username, change password) and admin user management (create, list, reset password, update, deactivate/reactivate)
- **Environment:** Backend `http://localhost:5000/api`, DB `firmware_custom`, seed users only (`pm@demo`, `coder@demo`, `admin@demo` — all `password123`)
- **Method:** API smoke via PowerShell `Invoke-RestMethod` / `Invoke-WebRequest` against the running backend

## Summary

| Checks | Passed | Failed |
|--------|--------|--------|
| 50     | 49     | 1*     |

*The single "failure" was a bug in the initial test script (HTTP method: `POST` used for a `PUT` route), not an application defect. Re-verified with the correct method; all app behavior passed. Another script artifact (a PowerShell 5.1 `Invoke-WebRequest` IE-parsing quirk) briefly suggested server restarts; the backend process PID was verified stable throughout — no application crash occurred.

## Test Matrix

### A. Login: email or username

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| A1 | admin login by email (`admin@demo.com`) | 200 | 200 | PASS |
| A2 | admin login by username (`admin@demo`) | 200 | 200 | PASS |
| A3 | PM login by email (`pm@demo.com`) | 200 | 200 | PASS |
| A4 | PM login by username (`pm@demo`) | 200 | 200 | PASS |
| A5 | Coder login by email (`coder@demo.com`) | 200 | 200 | PASS |
| A6 | Coder login by username (`coder@demo`) | 200 | 200 | PASS |
| A7 | Wrong password rejected | 401 | 401 | PASS |
| A8 | Unknown identifier rejected | 401 | 401 | PASS |

### B. Change password (own account)

Initial run used `POST /auth/password` (route is `PUT`) causing false 404s; re-run used PUT. All app behavior verified.

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| B1 | PM change `password123` → `TempPass123` | 200 | 200 | PASS |
| B2 | Old password rejected after change | 401 | 401 | PASS |
| B3 | New password accepts login | 200 | 200 | PASS |
| B4 | PM revert to `password123` | 200 | 200 | PASS |
| B5 | Same password request rejected | 400 | 400 | PASS |
| B6 | Coder change → `TempPass123` | 200 | 200 | PASS |
| B7 | Coder login with new password | 200 | 200 | PASS |
| B8 | Coder revert to `password123` | 200 | 200 | PASS |

### C. Admin creates users

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| C1 | Create single-role user (`SmokePm`, role PM) | 201 | 201 | PASS |
| C2 | New user role = `[PM]` | PM | PM | PASS |
| C3 | New user `is_active = true` | true | true | PASS |
| C4 | Create all-roles user (`SmokeAll`, PM+CODER+ADMIN) | 201 | 201 | PASS |
| C5 | Roles sorted `[ADMIN, CODER, PM]` | yes | yes | PASS |
| C6 | Duplicate email rejected (case-insensitive) | 409 | 409 | PASS |
| C7 | Duplicate username rejected | 409 | 409 | PASS |
| C8 | Password under 8 chars rejected | 400 | 400 | PASS |
| C9 | Invalid role (`SUPER`) rejected | 400 | 400 | PASS |
| C10 | Non-admin (PM token) create rejected | 403 | 403 | PASS |

### D. Login new accounts

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| D1 | New single-role user login by username | 200 | 200 | PASS |
| D2 | New single-role user login by email | 200 | 200 | PASS |
| D3 | New user carries role PM | PM | PM | PASS |
| D4 | All-roles user login by username | 200 | 200 | PASS |
| D5 | All-roles user carries all 3 roles | yes | yes | PASS |

### E. Users list

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| E1 | Admin lists users | 200 | 200 | PASS |
| E2 | Smoke PM user listed | true | true | PASS |
| E3 | Smoke PM `is_active = true` | true | true | PASS |
| E4 | Smoke PM roles `[PM]` | PM | PM | PASS |
| E5 | Smoke All user listed | true | true | PASS |
| E6 | Smoke All `is_active = true` | true | true | PASS |
| E7 | Non-admin list rejected | 403 | 403 | PASS |
| E8 | Unauthenticated list rejected | 401 | 401 | PASS |

### F. Reset password (admin action)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| F1 | Reset to `SmokeReset123` | 200 | 200 | PASS |
| F2 | Old password rejected after reset | 401 | 401 | PASS |
| F3 | New password login | 200 | 200 | PASS |
| F4 | Short new password rejected | 400 | 400 | PASS |

### G. Update / deactivate / reactivate

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| G1 | Rename username via PUT | 200 | 200 | PASS |
| G2 | Rename to existing username rejected | 409 | 409 | PASS |
| G3 | Deactivate (`is_active=false`) | 200 | 200 | PASS |
| G4 | Deactivated user `is_active=false` | false | false | PASS |
| G5 | Deactivated user login blocked | 403 | 403 | PASS |
| G6 | Reactivate (`is_active=true`) | 200 | 200 | PASS |
| G7 | Reactivated user login OK | 200 | 200 | PASS |

## Findings & Notes

1. **Delete account:** No real delete feature exists (backend has no `DELETE /users/:id`; the UI trash icon only deactivates). Per decision, **deactivate/reactivate was verified instead** — G3–G7 confirm the soft-delete lifecycle works.
2. **Initial B-section failures (404):** Script used `POST /auth/password`; route is `PUT`. Resolved; re-test passed.
3. **Apparent server "crashes":** PowerShell 5.1 `Invoke-WebRequest` (no `-UseBasicParsing`) fails IE parsing in non-interactive mode, causing lost/empty responses and false "connection failed" results — even though each request committed. Backend process PID was stable; no crash. `Invoke-RestMethod` was used for all reporting after this.
4. **`201` vs `200`:** Initial helper reported all successful responses as 200. Re-verified creation returns 201 (C1/C4 adjusted accordingly).
5. **Audit trail:** Smoke test users generated audit rows referencing the *admin actor* (`audit_trail.user_id`), so no cleanup of audit rows was needed on removal.

## Cleanup Record

- 3 smoke users removed via SQL: `smokeall2`, `smokepm`, `smokeverify` (matching `%@test.local`).
- Demo passwords restored to `password123` for `pm@demo` and `coder@demo` (admin was never changed).
- Final sweep: all 6 logins (email + username per role) returned 200.
- Users list returned to seed state: `pm@demo, coder@demo, admin@demo` (ids 1–3, all active).