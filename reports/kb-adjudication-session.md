# KB Adjudication Session — Same-Text Conflicting Labels

**Date:** 2026-09-05
**Source:** `backend/scripts/inspect-adjudication-groups.js` (re-runnable)
**Goal:** senior coder sets ONE canonical label per title text; superseded KB rows are retired so they stop voting in similarity matches.

> **Warning — read first:** all conflicting work orders are `LIVETEST-*` smoke-test artifacts, and several review reasons literally say *"similarity smoke review"* / *"reviewed in LIVE test"*. These verdicts were produced by test scripts clicking through the queue, not by genuine expert judgment. Default hypothesis: the conflicts are test noise. The senior coder's real job here is (a) confirm the canonical label per title, (b) decide whether LIVETEST-derived `KB-CODER-*` rows deserve to stay in the KB at all.

## Group A — "set point alarm changes" (L1 vs L2)

| Item | WO | Verdict | Reason |
|---|---|---|---|
| id 63 | LIVETEST-C-1788405119456 | **L1** Cosmetic Change | "Coder review confirmed L1 (Cosmetic Change)" |
| id 67 | LIVETEST-C-1788406736738 | **L2** Parametric Change | "Coder review: similarity smoke review" |

Context identical: model 1/1, SN `lt-c`, qty 1, no description. KB rows: `KB-CODER-63` (L1, 99) vs `KB-CODER-67` (L2, 99). Note the L2 verdict came from the smoke-review batch — weak provenance.

**Decision A:** canonical = [ ] L1 / [ ] L2 · fw_related = [ ] true (both claim true) · canonical row = [ ] KB-CODER-63 / [ ] KB-CODER-67 · retire = _______________
**Rationale:** _______________

## Group B — "air flow direction" (L0 non-FW vs L2)

| Item | WO | Verdict | Reason |
|---|---|---|---|
| id 65 | LIVETEST-C-1788405119456 | **L0** Non Firmware Related | "Coder review confirmed L0 (Non Firmware Related)" |
| id 69 | LIVETEST-C-1788406736738 | **L2** Parametric Change | "Coder review: similarity smoke review" |

Context identical (model 1/1, `lt-c`, qty 1). This is the sharpest conflict: firmware vs non-firmware. KB rows: `KB-CODER-65` (non-FW, 99) vs `KB-CODER-69` (L2, 99).

**Decision B:** canonical = [ ] L0 non-FW / [ ] L2 · canonical row = [ ] KB-CODER-65 / [ ] KB-CODER-69 · retire = _______________
**Rationale:** _______________

## Group C — "Mergepoint" (L2 vs L1 vs L2)

| Item | WO | Verdict | Reason |
|---|---|---|---|
| id 61 | LIVETEST-B-1788402740033 | **L2** | "reviewed in LIVE test", SN `lt-B` |
| id 66 | LIVETEST-C-1788405119456 | **L1** | "confirmed L1 (Cosmetic Change)", SN `lt-c` |
| id 70 | LIVETEST-C-1788406736738 | **L2** | "similarity smoke review", SN `lt-c` |

KB rows: `KB-CODER-56` (L2), `KB-CODER-61` (L2), `KB-CODER-66` (L1), `KB-CODER-70` (L2) — four rows, one keyword (`mergepoint`), majority L2. The single L1 verdict is the outlier; SN does not track the verdicts.

**Decision C:** canonical = [ ] L1 / [ ] L2 · canonical row = _______________ · retire = _______________
**Rationale:** _______________

## Control — "fiber glass custom unit" (L2 / L2, agree)

Items 64 + 68, both L2 with "confirmed" provenance. **No action.** Included so the session records what agreement looks like.

## Applying decisions

1. Copy `backend/scripts/kb-adjudications.template.json` to `backend/scripts/kb-adjudications.json` and fill the three verdicts (codes `L0`–`L5`, `fw_related` boolean, canonical + retire codes exactly as decided above).
2. Dry run: `node scripts/kb-adjudicate.js` (no `--apply` = prints planned changes only).
3. Apply: `node scripts/kb-adjudicate.js --apply`.
4. Re-run eval: `node scripts/eval-thresholds.js` — disagreements at ≥0.60 should be gone and precision recomputed.

Rules enforced by the script: canonical row must exist and be active; a row cannot be both canonical and retired; retired rows are set `is_active = FALSE` (never deleted — audit trail preserved); canonical row is stamped `source = 'ADJUDICATED'` with the decided confidence.
