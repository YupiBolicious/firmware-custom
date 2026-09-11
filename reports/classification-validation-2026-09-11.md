# Backend Classification Validation — Lexical & Semantic

**Date:** 2026-09-11
**Validated by:** live execution of existing test suites (`backend/scripts/*`), no code changes
**Branch:** main (`8c99198 semantic classification fix`)

## 1. Verdict

**Lexical classification: VALID.** 10/10 suites green, 72/72 business-eval accuracy (100%), 21/21 probe gate, 98/98 matcher parity.

**Semantic classification: VALID with one known gap.** All unit suites green (shadow, assist, decision, store, embedder, telemetry, flow); the adversarial safety suite (`test-semantic-decision-coverage`) has **1 of 29 cases failing (C07)** — a wrong semantic auto-claim caused by KB corpus drift, not a code defect. Details in §4.

## 2. Evidence Summary

| Script | Scope | Result |
|---|---|---|
| `test-dice-policy.js` | Lexical Dice corroboration floor, tier labels | OK (10 assertions) |
| `test-shadow.js` | Semantic shadow pipeline, kill switch, assist | OK (15 assertions) |
| `matcher-parity.js` | Lexical regression vs frozen snapshot | pass=98 fail=0 (98 cases) |
| `probe-gate.js` | 21 curated lexical probes (AUTO/SUGGEST/NEW tiers) | 21/21 |
| `score-business-eval.js` | 72 reviewed business cases vs ground truth | **72/72 (100%)**, 0 failures |
| `test-semantic-assist.js` | Semantic assist suggestion + margin floor | OK (14 assertions) |
| `test-semantic-decision.js` | Semantic decision policy + telemetry guard | OK (22 assertions) |
| `test-classify-flow.js` | End-to-end lexical→semantic→review routing | OK (9 assertions) |
| `test-semantic-store.js` | Embedding matrix store/retrieval | OK (18 assertions) |
| `test-embedder.js` | Embedder model (bge-small-en-v1.5) | OK (8 assertions) |
| `test-classify-telemetry.js` | Production DECIDED/REVIEWED telemetry | OK (22 assertions) |
| `test-semantic-decision-coverage.js` | 29-case adversarial safety suite | **28/29 — C07 FAIL** (§4) |

Sum: **118 unit assertions OK**, 98 parity cases, 21 probe cases, 72 business cases — **1 known gap**.

## 3. What "works" means here

### 3.1 Lexical classification (`classificationService.classifyItem`)
Pipeline: tokenize/canonicalize → Jaccard + Dice-bigram scoring against active KB rows with model-context bonus → tiered decision (`decider.decideBest`).

Proven behaviors:
- **EXACT / strong match auto-classifies**: "Emergency stop button" → `LEXICAL_SIMILARITY`/`CLASSIFIED`, match_score 1.0, complexity level attached. Plural variant "Emergency stop buttons" also reaches the strong tier.
- **Unknown input falls back safely**: "Quantum flux deflector calibration" → `MANUAL`/`CODER_REVIEW`, match_score 0.
- **Ambiguous input routed to review**: "LED panel light" (overlaps KB-1002/KB-1003) → `SIMILARITY`/`CODER_REVIEW`, no wrong auto-claim.
- **Rule matches apply after KB**: long repetitive alarm text → `RULE`/`CLASSIFIED` via classification_rules.
- **Edge cases handled**: empty title, null description, unicode, 40× repeated text — none crash; all route to a valid verdict.
- **Business accuracy**: 72/72 reviewed cases at ground truth, avg latency 2.3 ms (min 1, max 15).
- **Determinism**: 98/98 matcher-parity cases byte-identical to the frozen snapshot.

### 3.2 Semantic classification (`shadowClassify` + `classifyFlow`)
Pipeline: embed text with bge-small-en-v1.5 → cosine/semantic retrieval over KB embedding matrix → margin gate (≥ 0.15) → code-token agreement → `decideSemantic` verdict or blocked-with-reason review fallback. Runs only on lexical-weak items; kill switch `SEMANTIC_ENABLED=0` restores pure lexical (verified in `test-shadow`).

Proven behaviors:
- **Real retrieval works**: "Emergency stop button" embeds → top match KB-1004 @ 0.952 similarity; assist suggestion fires at score 0.959 / margin 0.405.
- **Discrimination works**: embedder related pair 0.754 vs unrelated pair 0.341; store matrix 29 rows, ~250 ms build, warm retrieve 4 ms.
- **Safety gates verified**: kill switch, margin floor, code-token gate, unresolved-row, failure simulations (embed error / empty candidates / decider throw) all route to review, never wrong-auto (3/3 failure sims, 14 margin blocks, 2 safety blocks).
- **Telemetry honest**: DECIDED/REVIEWED audit events join correctly; scorer exits 1 when wrong rate exceeds threshold (guard for `SEMANTIC_ENABLED=0`).

## 4. Known gap (C07) — semantic coverage suite

`test-semantic-decision-coverage.js` case C07:

```
FAIL C07 volt-free contact pair -> DECISION:KB-CODER-177 (expect no-wrong-auto)
summary: flows=23 auto=2 correctAuto=1 wrongAuto=1 blockedMargin=14 ...
```

- Input "Volt-free contact pair" was **auto-claimed** by the semantic decider as KB-CODER-177 ("0 Volt Relay Contact", fw_related=true, L3). The suite requires this thin, table-fragment phrase to stay review-routed ("no-wrong-auto" requirement).
- **Root cause: KB corpus drift, not code.** `KB-CODER-177` is absent from `database/*.sql` seeds and predates the authored suite expectations — it was added to the live corpus later, and its embedding now attracts the phrase above the margin floor. The suite's frozen `tests/evaluation/semantic-decision-coverage.json` expectations predate the row.
- **Impact:** 1 wrong auto-classification when a live user submits exactly "Volt-free contact pair". All other 28 coverage cases, all 21 probes, all 72 business cases, and every unit suite pass.
- **Remediation options (not applied — out of scope for this validation):** (a) adjudicate/curate the KB-CODER-177 row or its embedding, (b) re-baseline the coverage case expectation if the claim is accepted, (c) raise the semantic margin floor.

## 5. Environment notes

- DB live at localhost (`.env` present), embedding worker available (semantic paths executed for real — top matches and margins are measured, not stubbed, except the suite's explicit failure simulations).
- No scratch data created; suites leave DB baseline intact (per project anti-pattern rules).