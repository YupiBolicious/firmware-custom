# KB Stage-1 Optimization — Completion Report

**Date:** 2026-09-07
**Baseline state:** 0 work orders, 19 active KB rows (5 SEED + 3 ADJUDICATED + 11 learned). Word-match lexical config is the system of record. No ML, embeddings, pgvector, or algorithm changes — per constraint.

## Scope kept

Normalization, tokenization, scoring weights, thresholds (0.60/0.35), and all business rules are byte-identical to the pre-optimization system. The 21-probe gate plus parity mode enforce that mechanically (see Verification).

## What was built

**Prepared-KB cache (`backend/src/services/kbCache.js`).** Active KB rows load once (explicit columns only — confirmed no `SELECT *` existed), tokenize once into `{tokens, normTitle}` sets, and are reused across all items. Cache key is the `kb_corpus_version` row: every KB write path (repository CRUD, coder learning, backfills, adjudications) bumps it, so stale KB cannot silently persist — the next read rebuilds. Explicit `invalidate()` for operational use.

**Scorer separation (`classificationService.js`).** `scorePair` accepts prepared rows and falls back to tokenizing raw rows, so every existing caller and diagnostic script works unchanged. New `selectCandidates` seam (identity today) is the documented plug point for a future pg_trgm prefilter — zero scorer rewrite required when that day comes.

**Incremental batch analyze (`workOrderService.js`).** Reference data loads once per call; each item is re-scored only when its fingerprint (`input_hash`) or the corpus version drifted; human `MANUAL` verdicts are never recomputed; match rows are replaced instead of piled; estimations regenerate only for re-scored items. Single-item classification is inherently cache-backed; the analyze loop is the batch path sharing one preparation. The analyze response carries an additive `perf` block (`kbRows`, `kbCandidates`, `kbCacheHit`, `kbQueryMs`, `kbPrepMs`, `itemsQueryMs`, `itemsTotal`, `itemsScored`, `scoreMs`, `writeMs`, `totalMs`).

## Verification evidence

- **21-probe gate: 21/21 pass, parity 0 mismatches** (`scripts/probe-gate.js --parity`). Three initial misses were triaged as unmeasured-guess expectations with documented `note` fields, not regressions; one probe later versioned correctly when the corpus legitimately learned its answer (KB-CODER-90).
- **`test-incremental`: 20/20** — single item, 3-item batch with zero additional KB builds, cache reuse by object identity, explicit invalidation, version-bump rebuild, empty KB → MANUAL + review, duplicate inputs → byte-identical outputs, prepared-vs-raw score equality.
- **Pre-existing suites green:** token policy 53/53, no-flip PASS, `node --check` clean, modules load cycle-free.

## Performance

- **Before/after (`bench-classify.js`, 21 cases × 5 rounds, 18 rows):** 181 ms → 27 ms total (1.72 → 0.26 ms per case), **6.70×**, dominated by eliminating per-item KB queries (142 → 1 ms).
- **Scale (`bench-scale.js`, synthetic in-memory growth, same scorer):** 18 rows → 13 ms; 180 → 65 ms; 1,800 → 584 ms; 18,000 → 8.1 s (~15–20 µs/pair, linear). Sub-30 ms per-item classifies hold into the low thousands of rows.

## Bottleneck verdict (pg_trgm)

Not justified. Sub-second classifies hold into the low thousands of rows, and incremental scoring means corpus growth taxes only dirty items. Add trigram prefiltering at the `selectCandidates` seam when per-item scoring approaches ~200 ms at real corpus size, or sooner if typo-tolerance (a quality argument, independent of speed) becomes the requirement.

## Scripts inventory (all under `backend/scripts/`)

`kbCache` consumer scripts: `probe-set.json`, `probe-gate.js`, `bench-classify.js`, `bench-scale.js`, `test-incremental.js`, `simulate-dirty.js`, `token-policy-check.js`, `token-audit.js`, `eval-thresholds.js`, `context-noflip.js`, `probe-variants.js`, `check-new-seeds.js`, plus migration runners and one-shot inspect/clean utilities from the data-hygiene passes.
