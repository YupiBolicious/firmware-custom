# Classification Workflow Update — Matcher/Decider Split

**Date:** 2026-09-08
**Constraint:** zero behavior change. The `EXACT_MATCH`-vs-similarity naming defect (J-6) is still present by explicit deferral — this phase draws the boundary that makes its future fix local, nothing more.

## Before: one function doing three jobs

`classifyItem` (`backend/src/services/classificationService.js`, ~180 lines) interleaved retrieval (KB loop), scoring (Jaccard/Dice/context inline), and business judgment (0.6/0.35 branches, method labels, statuses, confidence formula, RULE loop, MANUAL fallback). Any change — rename, threshold, fusion, embedding retrieval — had to operate inside the same tangled function, with blast radius over everything.

## After: evidence, judgment, and a shim

```
classifyItem (~15 lines: normalize → load refs → score → decide → return)
    ├── matcher.js      — retrieval + scoring only (Jaccard, scorePair,
    │                     selectCandidates, scoreCandidates). No method
    │                     strings, no thresholds, no statuses.
    └── decider.js      — policy only (0.6/0.35 tiers, method labels incl.
                          EXACT_MATCH verbatim, confidence formula, RULE
                          loop, MANUAL fallback). No scoring math.
```

`check-layering.js` enforces the boundary mechanically (matcher: no policy strings; decider: no scoring calls). `classificationService` keeps its exact export surface, so all 15+ scripts importing from it work untouched.

## Before/after comparison (the acceptance criterion)

| Dimension | Before | After | Delta |
|---|---|---|---|
| Verdicts, 98 parity cases (21 probes + 72 business + 5 edge) | baseline | **98/98 byte-identical** | none |
| Verdict mix | 74 exact / 8 similarity / 1 rule / 15 manual | identical | none |
| Probe gate | 21/21 | 21/21 | none |
| Business eval | 72/72 (100%) | 72/72 (100%) | none |
| Policy/token/shadow/assist/incremental/doc suites | green | green | none |
| Thresholds, labels, confidence, statuses | as-was | as-was | none |
| `classificationService.js` diff | — | +5 / −119 lines, moves-only | structure only |

The comparison *is* the deliverable: every number identical by measurement, not by review. One mid-task slip (dropped `inputHash` during shim editing) was caught by file reading and restored verbatim — parity confirms the recovery.

## What this unlocks (explicitly not done here)

- Method rename (`EXACT_MATCH` → honest labels): now a decider-only edit.
- Threshold calibration: decider-only, with the eval set as judge.
- Embedding retrieval: lands beside `matcher.js` behind the existing `selectCandidates` seam; fusion becomes an explicit third step rather than another inline `if`.
- Each of the above remains a separate plan with its own evidence bar — the boundary exists so they stay separable.
