# Semantic Assist Robustness – 2026-09-22

## Verdict: CONTRACT PASSED (clean, standalone)

67 PASS / 0 GAP / 0 FAIL. Run standalone (no regression suites in-process — they were the concurrent-DB polluters). Cleanup restored active KB 32 → 32 with 0 leftover rows/WOs; users untouched (5). Verified post-run: 0 KB-RB-* / KB-SA-* rows, 0 SRB-% / SA-% WOs, no inactive KB.

Baseline: {"kv_version":174,"active_kb":32,"wo_count":8,"users":5} · env: {"margin":"0.15","assistScore":"0.60","semanticEnabled":"1"}

## Findings by phase

| Case | Item | Status | Assist KB | Score | Margin | Block reason | Expected KB |
|---|---|---|---|---|---|---|---|
| positive:e-stop | install the panic stop pushbutton at the operator position | CODER_REVIEW | KB-RB-1790044109937-D0 | 0.73 | 0.026 | ASSIST_PRESENT | KB-1004 |
| positive:sash window | add a motorized sliding sash window to the laboratory wall | CODER_REVIEW | KB-RB-1790044109937-D1 | 0.84 | 0.036 | ASSIST_PRESENT | KB-1005 |
| positive:particle counter | wire the sensing inputs into the airborne particle monitor and the gas sampling unit | CODER_REVIEW | KB-RB-1790044109937-D2 | 0.74 | 0.045 | ASSIST_PRESENT | KB-1010 |
| positive:sentinel alarm | install one sentinel signaling contact alongside every alert relay | CODER_REVIEW | KB-RB-1790044109937-D3 | 0.76 | 0.044 | ASSIST_PRESENT | KB-1017 |
| ambiguous:zolli-pair | apply the servo axis lock step procedure along the conveyor line during the shift changeover 1790044109937 | CODER_REVIEW | KB-RB-1790044109937-AM-A | 0.87 | 0.000 | ASSIST_PRESENT | zolli pair |
| negative:unrelated | qipfrobnit wuzzler blix frobnicate | CODER_REVIEW | - | - | - | SCORE_BELOW_FLOOR | - |
| negative:codemismatch | redo the gain tuning on the motion driver module, documented for MODEL-RB-21-6000 1790044109937 | CODER_REVIEW | - | - | - | CODE_GATE:MODEL_CODE_MISMATCH | KB-RB-1790044109937-CM |
| robust:deactivate-d1-twin |  | CODER_REVIEW | - | 0.70 | 0.073 | ASSIST_PRESENT | KB-1004 |
| robust:reactivate-d1-twin |  | CODER_REVIEW | - | 0.73 | 0.024 | ASSIST_PRESENT | - |

### Live positive cases (all 4)
Semantic assist fires on token-free firmware domains: score ≥ 0.60 absolute floor and < 0.15 margin, status stays CODER_REVIEW (no auto-claim), assist references the near-twin of the expected seed domain, assist_complexity_level_id prefilled from the suggested KB row.

### Ambiguous pair
Two near-identical zolli rows; item is a diluted paraphrase. Landed CODER_REVIEW with assist on AM-A at 0.87, margin 0.000 → auto-classification blocked (MARGIN_BELOW_FLOOR), assist still shown (suggestion-only gate).

### Negatives
- Unrelated (qipfrobnit…): top semantic score < 0.60 → no assist, SCORE_BELOW_FLOOR, CODER_REVIEW fallback.
- Model-code mismatch (MODEL-RB-21-6000 vs row MODEL-RB-A-9000): top ≥ 0.60 yet no assist → CODE_GATE:MODEL_CODE_MISMATCH. Proves the score gate alone does not leak assist past the code gate.

### Robustness (same item across corpus mutations)
Deactivating the suggested twin removes the reference; recompute re-anchors to the live seed (KB-1004) — stale assist never points at the deactivated row. Reactivation restores the twin suggestion. CODER_REVIEW fallback preserved throughout. Adding similar + unrelated rows bumps kb_corpus_version exactly +2; analyze itself bumps nothing.

### Usability + kill switch
Accept path with semantic_assist_response=ACCEPTED succeeds. Kill child (SEMANTIC_ENABLED=0 on :5132) re-analyzes after a corpus bump (preserveAssist reuse bypassed) → zero Assist on every CODER_REVIEW item, lexical decisions identical before/after (sameLexical=true).

Unit (deterministic) boundaries + code-token gates executed in-process (0.59 no-assist, 0.60 assist, margin 0.149 review+assist, 0.150 auto-eligible; MODEL/VERSION/SERIAL/MEASUREMENT mismatches block).

Kill switch: {"beforeKill":{"pos:e-stop":"CODER_REVIEW","pos:sash window":"CLASSIFIED","pos:particle counter":"CODER_REVIEW","pos:sentinel alarm":"CODER_REVIEW","amb:zolli-pair":"CODER_REVIEW","neg:unrelated":"CODER_REVIEW","neg:codemismatch":"CODER_REVIEW"},"afterKill":{"pos:e-stop":"CODER_REVIEW","pos:sash window":"CLASSIFIED","pos:particle counter":"CODER_REVIEW","pos:sentinel alarm":"CODER_REVIEW","amb:zolli-pair":"CODER_REVIEW","neg:unrelated":"CODER_REVIEW","neg:codemismatch":"CODER_REVIEW"},"sameLexical":true}

## Regressions
Run separately (not in this harness) to keep the kill-switch regression contract green: `backend/scripts/test-semantic-assist.js`, `tempLiveTest/auditObservabilitySmoke.js`, `tempLiveTest/_verify_semantic_assist.js`.

## Findings
- Harness now runs standalone; the 3 regression suites were removed from its body (they pollute the shared DB concurrently and break the cleanup assert).
- Fixed sweep `kbrb` bug: the step passed `p:['x']` to a parameterless `DELETE` → node-postgres "bind message supplies 1 parameters" error that was swallowed into the unprinted `removed` map, silently leaking all KB-RB rows and failing cleanup. The sweep loop now binds params only when the SQL contains placeholders (`/\$\d+/`).
- No threshold, classifier, or assist rule was changed by this run.
- Post-cleanup corpus: kb_corpus_version 187 (monotonic counter advanced by run's create/update/delete + sweep deletes; not reconciled downward), active_kb 32 = baseline, total_kb 32, inactive 0, KB-RB-/KB-SA- leftovers 0, SRB-/SA- WOs 0, users 5.