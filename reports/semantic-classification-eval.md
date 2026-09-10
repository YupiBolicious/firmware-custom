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
