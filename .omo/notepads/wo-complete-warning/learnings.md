# Learnings — wo-complete-warning

Conventions, patterns, and successful approaches discovered during work on this plan.

_Auto-scaffolded by /start-work. Append new entries below - never overwrite._

---

## 2026-09-03 session learnings
- Subagent delegation (`task()`) is unlicensed here ("not licensed to use Copilot"); implementation + verification run directly. Environmental deviation, recorded.
- Backend is a persistent `node src/server.js` process; code edits need a restart + health re-check.
- `notify()` is fire-and-forget: assert notifications on settled DB state with polling.
- Cleanup order (FKs): `audit_trail` first, then `notifications`, `user_roles`, `users`; scratch WOs: documents → tasks → items/groups → WO → audit/notifications.
- WO lifecycle DRAFT→ANALYZED→FINALIZED→PRODUCTION→COMPLETED; rollback only ANALYZED→DRAFT (purges analysis + tasks + CODER_REVIEW notifications). Docs uploadable only in PRODUCTION/COMPLETED.
- Classifier mixes machine context (model code, version, serial) into item tokens: with 4 fixed ctx tokens, an item needs ≥6 KB-token overlap for EXACT (≥0.6). For deterministic CLASSIFIED in tests, cover a sparse KB entry's full token set across title+serial (proven: KB-CODER-5, 11/15 = 0.733).
- Uploading a doc in PRODUCTION auto-completes the WO (`trigger: 'document_upload'` audit) — explicit `completeProduction` therefore only ever sees zero-doc WOs via API; the flag documents that invariant.
- Upload endpoint returns 201, not 200 — assert accordingly.
- 2026-09-03 REVERSAL: user reported the flag "doesnt work" → fully reverted
  (import, count, audit fields, spread return). Re-verified 7/7 via
  `_verify_revert.js`. `_verify_wowarn.js` superseded, kept as history.
- 2026-09-03 DROP: user asked to drop every change from this plan. Grep scan
  confirms zero flag remnants in `workOrderService.js`; stale
  `_verify_wowarn.js` deleted. Pre-existing diff (rollback, itemsEditable,
  IDOR guard) untouched — not this plan's work. `_verify_revert.js` kept.
