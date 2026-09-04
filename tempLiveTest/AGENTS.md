# LIVETEST HARNESS KNOWLEDGE BASE

## OVERVIEW
Live smoke scripts against `http://localhost:5000` (backend must be running). No test runner — plain Node + `fetch` + direct `pool` queries, results to `_*-results.json`, findings to `*-report.md`.

## CONVENTIONS
- Log in as demo accounts; create scratch rows with unique suffixes (`-${Date.now()}`), never mutate real data except where the test demands (WO-21 grant/revoke, always restored).
- Assert notifications on settled DB state with `waitFor` polling — `notify()` is fire-and-forget.
- Cleanup order matters (FKs): `audit_trail` rows first, then `notifications`, `user_roles`, `users`. Always re-verify baselines (user count 4, WO-21 DRAFT + 0 grants).
- Keep `adminSmoke.js` (round 1) and `adminSmoke2.js` (round 2) re-runnable; `_verify_*.js` for single-fix verification.
