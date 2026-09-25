# Lexical Implementation & Semantic Posture Report

**Date:** 2026-09-21
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

- Thresholds 0.60 / 0.35, Dice floor default 0, assist absolute score floor 0.60 (`SEMANTIC_ASSIST_MIN_SCORE`, provisional) + auto-claim margin floor 0.15 (`SEMANTIC_MARGIN`), coverage minimum 2 tokens. Margin gates auto-claim only — a low top-vs-second margin must NOT block assist.
- Method vocabulary: EXACT_MATCH (identity only), LEXICAL_SIMILARITY, SIMILARITY, RULE, MANUAL, SEMANTIC_ASSIST (suggestion tag only).
- Ground rules observed throughout: human verdicts never recomputed; single-token inputs never auto-claim; below-band never auto-claims; generic KB rows (no codes) stay matchable.

## 3. Semantic posture: built, leashed, suggesting (via review queue)

| Component | File | State |
|---|---|---|
| Embedder worker (BGE-small quantized, lazy, timeout→null) | `src/services/embedWorker.js`, `embedder.js` | live, 8/8 tests |
| Version-keyed Float32 matrix (28 rows) | `src/services/semanticStore.js` | live, 18/18 tests |
| Shadow wrapper `{lexical, semantic, final}` | `src/services/shadowClassify.js` | live, wired into analyze as observation |
| Assist rule (weak + candidate + margin 0.10 + code gate → suggest) | `src/services/semanticAssist.js` + inline twin in `shadowClassify` | live, 13 + 15 assertions |
| Assist snapshot → review queue pre-fill | review service/repo + classifyFlow | live (Assist queue fields, forced-choice 400, Accept pre-fills complexity) |
| Code-token gate (MODEL/VERSION/SERIAL/MEASUREMENT) | `tokenPolicy.js` + `semantic-code-probes.json` | live, 72 policy + 4/4 probes |

What semantic **cannot** do today: decide, override, auto-claim, persist vectors, or influence any verdict — by construction (null-safe fallbacks) and by kill switch (`SEMANTIC_ENABLED=0` restores byte-identical lexical behavior). On the coder-review path it now *suggests*: a top semantic candidate with margin ≥ 0.10 is snapshotted onto the classification and surfaced in the review queue; coder must explicitly Accept/Ignore.

## 4. Measured state (latest green runs)

- 21-probe lexical gate 21/21 · business eval 72/72 (100%) · analyze↔probe parity 11/11 · matcher parity 98/98 · policy 72/72 · shadow 15/15 · assist 13/13 · flow 9/9 + live analyze · incremental 22/22 · doc-estimation 20/20 · no-flip PASS · layer guard PASS.
- **Assist end-to-end live verifier 31/31 (2026-09-21)** — analyze stores snapshot, audit DECIDED/REVIEWED carry assist fields, queue exposes assist + pre-fill ids, forced-choice 400, Accept persists ASSIST_RESPONSE=ACCEPTED and sources `suggestion_kb_id` from the assist row, unrelated items get no assist, assist survives KB deactivation (snapshot), stale-KB manual IGNORED not blocked. Backend-wide observability smoke 63/63 (`tempLiveTest/auditObservabilitySmoke.js`).
- Matrix-key correctness gotcha: corpus version lives in `kb_corpus_version` (explicit counter), not derived from rows — **any direct SQL write to `kb_items` must bump it** or the semantic matrix/kb cache silently serves stale corpora (`kbCacheHit:true` on a row that shouldn't be cached). The live verifier bumps after its insert.
- Perf: 6.70× classify speedup from caching; sub-30 ms per-item into the low thousands of rows; warm embed 6–7 ms.

## 5. Deliberately parked (not forgotten)

pgvector, stored vectors, fusion scoring, threshold tuning, reference-table seeding (rulebook stays read-only), arbitration, correction/re-review path, per-row incremental embedding. Each has a named trigger (measured need + approval), none has code.
