# Semantic Classification — First Controlled Implementation

## What was built
- `decider.decideSemantic({ itemText, matches, margin, rowText, row })` — pure policy, returns a
  `SEMANTIC_CLASSIFICATION` verdict or `null` (→ existing review fallback). Gates: candidate present,
  `margin >= SEMANTIC_MARGIN` (default 0.15, env-overridable), code-token agreement, resolved KB row.
  Confidence `min(score*100, row.confidence, 99)`; status follows `row.fw_related`.
- `classifyFlow.trySemanticDecision` — runs only on the lexical-weak path (strong lexical still
  short-circuits, kill switch intact via shadow returning `semantic: null` when disabled).
  `PATH_SEMANTIC` now means a semantic decision verdict; review-with-assist returns `PATH_REVIEW`
  with the lexical verdict untouched (suggestion never overwrites).
- `workOrderService` match-type mapping: `SEMANTIC_CLASSIFICATION → SIMILARITY`.
- Unchanged: Exact/Rule/Lexical, thresholds 0.60/0.35, Jaccard/Dice/tokenizer/scoring, no schema change.

## Verification
| Check | Result |
|---|---|
| test-semantic-decision (new, 18 assertions) | OK |
| test-classify-flow (updated path semantics, 9) | OK |
| Full suite (13 test scripts) | OK |
| probe-gate (21 probes) | 21/21 |
| Business eval (72 reviewed cases) | 72/72 (100%), failures none |
| Paraphrase recall (14 probes) | 14/14 DECISION_BLOCKED, 0 wrong auto-decisions |
| test-flow-live | OK after removing stale scratch WO (see note) |

## Notes
- Paraphrase probes all block: margins fall below the 0.15 floor (e.g. shadow probe margin 0.084).
  Conservative by design for a first implementation — zero wrong auto-classifications.
- `test-flow-live` initially failed on a stale `WO-TEST-FLOW-001` row (id 76) left by an earlier run:
  the unique `wo_number` made the new INSERT fail, masking the real error behind the cleanup check.
  Deeper finding: the script called `process.exit(0)` inside `try`, so the `finally` cleanup never ran
  on success — every green run leaked one scratch WO (row 82 confirmed from a passing run).
  Fixed with the `test-analyze-parity` pattern (explicit delete + zero-verify in `try` before exit);
  re-run green with zero `WO-TEST%` rows left. Pre-existing bug, unrelated to the semantic change.
- Recall script (`run-paraphrase-recall.js`) now also records `decisionPath/decisionMethod/decisionKb/
  decisionVerdict` per probe alongside the existing assist verdicts.

## Production telemetry (open item 3 fix)
- `CLASSIFY_DECIDED` audit event per freshly-scored item (reused inputs skip — already recorded):
  path, lexical origin, decision method/KB, suggested complexity/fw, semantic margin/top candidate,
  block reason + detail, assist KB. `decideSemantic` now returns `{ verdict, blocked }` so the block
  reason (`NO_SEMANTIC | NO_CANDIDATE | ROW_UNRESOLVED | MARGIN_BELOW_FLOOR | CODE_GATE`) is truthful,
  not inferred. `classifyFlow` returns a uniform shape (`lexical`, `decisionBlocked` on all paths).
- `CLASSIFY_REVIEWED` audit event on coder review completion (final fw/complexity/level).
- `scripts/score-semantic-telemetry.js` joins DECIDED→REVIEWED per item: auto-decision wrong rate
  (overridden / judged), suggestion accuracy on the review path, block-reason histogram.
  Exits 1 when judged decisions ≥ `TELEMETRY_MIN_DECISIONS` (default 20) and wrong rate >
  `TELEMETRY_MAX_WRONG_RATE` (default 0.05) → pull `SEMANTIC_ENABLED=0`.
- Verified end-to-end: live analyzes recorded 7 DECIDED events (4 lexical, 3 `MARGIN_BELOW_FLOOR`);
  scorer aggregates them correctly. Unit tests: `test-semantic-decision` (22), `test-classify-telemetry` (22).
  Suite + gate still green; no classification behavior changed (analyze parity holds).

## Decision-path coverage (open item 4)
- Dedicated suite `scripts/test-semantic-decision-coverage.js` (29 cases, green), separate from the
  21 lexical probes, 72 business cases, and assist tests. Per-case table (input, expected KB, lexical,
  semantic top/score/margin, gate, path, verdict, expected, pass/fail) prints to console and is stored in
  `tests/evaluation/semantic-decision-coverage.json`. No production thresholds touched: the suite only
  overrides `SEMANTIC_MARGIN`/`SEMANTIC_ENABLED` in-process with save/restore (verified clean at exit).
- Results: 23 flows, 1 auto-decision (correct, PP-01 at lowered floor), 0 wrong auto-decisions,
  9 correct-candidates blocked, 15 blocked on margin, 2 blocked on safety, 3/3 failure simulations
  routed to review. All 10 requirements covered: accept (fw), margin-block, no-wrong-auto over the full
  probe set, code gate (PP-05, floor lowered under its margin since margin is evaluated first),
  unresolved row (stubbed), embed failure / empty candidates / decider throw (stubbed), lexical
  short-circuit with `decideSemantic` provably uncalled (call counter), kill switch parity with direct
  `classifyItem`, non-FW `NON_FIRMWARE`, exact floor boundary (`==` fires, `<` blocks).
- Uncovered branches found and closed: the `trySemanticDecision` catch (`ERROR` reason) had no coverage —
  added case 6c. Remaining known gap (not a code branch): the corpus contains zero `fw_related=false`
  KB rows, so the live `NON_FIRMWARE` semantic path is unreachable in production; req 9 covers it with a
  synthetic row until such a row exists.
- Acceptance re-verified after the suite landed: probe gate 21/21, business eval 72/72, full suite green.
