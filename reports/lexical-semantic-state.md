# Lexical Implementation & Semantic Posture Report

**Date:** 2026-09-09
**Scope:** how the lexical classifier is currently implemented, and exactly where semantic stands relative to it. No behavior was changed to write this report.

## 1. Lexical pipeline (production decider — the only decider)

```
INPUT (title, description, quantity, model/version, readiness)
  → normalize
  → matcher.js
      ├─ exact/deterministic check data (normalized string equality)
      ├─ Jaccard (token overlap, plural folding, canonical map, stopwords)
      ├─ Dice/bigram rescue (spacing, spelling, morphology)
      ├─ title-or-full max (descriptions support, never penalize)
      ├─ IDF-weighted overlap component
      ├─ context re-rank (+0.10 same model+version, +0.05 same model, −0.10 cross-model; serials excluded)
      ├─ coverage count (KB rows containing every item token) + lexical margin (best − runner-up)
      └─ selectCandidates seam (identity today; future prefilter point)
  → decider.js (policy only, no scoring math)
      ├─ normalized-identical → EXACT_MATCH (auto)
      ├─ score ≥ 0.60 → LEXICAL_SIMILARITY, unless Dice floor fails it
      │    (Dice-driven candidates need title-Jaccard ≥ LEXICAL_DICE_MIN_JACCARD, default 0)
      ├─ unique coverage (1 row, agreed with best, ≥2 shared tokens, in-band) → auto-claim
      ├─ score ≥ 0.35 → SIMILARITY (suggest + mandatory coder review)
      ├─ RULE substring patterns (priority ordered) → auto
      └─ MANUAL → coder review
  → classifyFlow.js router: strong lexical returns immediately (no semantic work);
    weak/uncertain routes to semantic observation, then review with or without suggestion
```

Verification tiers feed estimation separately (`verification_mh` 8/24/40 by tier + complexity hours; doc component dropped per directive; line total = verification once + complexity × qty).

## 2. Policy inventory (frozen unless explicitly re-approved)

- Thresholds 0.60 / 0.35, Dice floor default 0, margin floor 0.15 (assist only), coverage minimum 2 tokens.
- Method vocabulary: EXACT_MATCH (identity only), LEXICAL_SIMILARITY, SIMILARITY, RULE, MANUAL, SEMANTIC_ASSIST (suggestion tag only).
- Ground rules observed throughout: human verdicts never recomputed; single-token inputs never auto-claim; below-band never auto-claims; generic KB rows (no codes) stay matchable.

## 3. Semantic posture: built, leashed, observing

| Component | File | State |
|---|---|---|
| Embedder worker (BGE-small quantized, lazy, timeout→null) | `src/services/embedWorker.js`, `embedder.js` | live, 8/8 tests |
| Version-keyed Float32 matrix (28 rows) | `src/services/semanticStore.js` | live, 18/18 tests |
| Shadow wrapper `{lexical, semantic, final}` | `src/services/shadowClassify.js` | live, wired into analyze as observation |
| Assist rule (weak + candidate + margin 0.15 + code gate → suggest) | `src/services/semanticAssist.js` + inline twin in `shadowClassify` | live, 13 + 15 assertions |
| Code-token gate (MODEL/VERSION/SERIAL/MEASUREMENT) | `tokenPolicy.js` + `semantic-code-probes.json` | live, 72 policy + 4/4 probes |
| Margin experiment harness | `experiment-margin-rule.js` | lab-only |

What semantic **cannot** do today: decide, override, auto-claim, persist vectors, or influence any verdict — by construction (null-safe fallbacks) and by kill switch (`SEMANTIC_ENABLED=0` restores byte-identical lexical behavior).

## 4. Measured state (latest green runs)

- 21-probe lexical gate 21/21 · business eval 72/72 (100%) · analyze↔probe parity 11/11 · matcher parity 98/98 · policy 72/72 · shadow 15/15 · assist 13/13 · flow 9/9 + live analyze · incremental 22/22 · doc-estimation 20/20 · no-flip PASS · layer guard PASS.
- Assist ablation: 9/9 weak cases correctly blocked (all true novels). Paraphrase recall experiment: 0/14 suggested under the strict rule; the looser experimental rule traded 2 rescues for 2 wrongful suggestions and was rejected — evidence preserved in the trajectory, not enforced.
- Perf: 6.70× classify speedup from caching; sub-30 ms per-item into the low thousands of rows; warm embed 6–7 ms.

## 5. Deliberately parked (not forgotten)

pgvector, stored vectors, fusion scoring, threshold tuning, reference-table seeding (rulebook stays read-only), arbitration, correction/re-review path, per-row incremental embedding. Each has a named trigger (measured need + approval), none has code.
