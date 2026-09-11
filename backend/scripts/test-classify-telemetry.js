const assert = require('assert');
const telemetry = require('../src/services/classifyTelemetry');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const kbById = new Map([[9001, {
  id: 9001, kb_code: 'KB-TEST', complexity_level_id: 3, fw_related: true,
}]]);

const decidedInput = (over = {}) => ({
  path: 'semantic',
  result: {
    classification_method: 'SEMANTIC_CLASSIFICATION', status: 'CLASSIFIED',
    kb_item_id: 9001, match_score: 0.75,
  },
  semantic: { topMatches: [{ kbCode: 'KB-TEST', score: 0.75 }], margin: 0.31 },
  assist: null,
  lexical: { classification_method: 'SIMILARITY', status: 'CODER_REVIEW' },
  decisionBlocked: null,
  classificationId: 5001,
  kbVersion: 29,
  kbById,
  ...over,
});

(async () => {
  const decided = telemetry.buildDecidedDetails(decidedInput());
  eq(decided.path, 'semantic', 'decided: path recorded');
  eq(decided.classification_id, 5001, 'decided: classification linked for join');
  eq(decided.lexical_method, 'SIMILARITY', 'decided: lexical origin preserved');
  eq(decided.decision_method, 'SEMANTIC_CLASSIFICATION', 'decided: decision method recorded');
  eq(decided.suggested_kb_code, 'KB-TEST', 'decided: kb code resolved from map');
  eq(decided.suggested_complexity_id, 3, 'decided: suggested complexity captured for outcome join');
  eq(decided.suggested_fw, true, 'decided: suggested fw flag captured');
  eq(decided.semantic_margin, 0.31, 'decided: margin evidence attached');
  eq(decided.semantic_top_kb, 'KB-TEST', 'decided: top candidate recorded');
  eq(decided.block_reason, null, 'decided: no block on accept');

  const blocked = telemetry.buildDecidedDetails(decidedInput({
    path: 'review',
    result: { classification_method: 'SIMILARITY', status: 'CODER_REVIEW', kb_item_id: 9001, match_score: 0.4 },
    decisionBlocked: { reason: 'MARGIN_BELOW_FLOOR', detail: { margin: 0.084 } },
    semantic: { topMatches: [{ kbCode: 'KB-TEST', score: 0.6 }], margin: 0.084 },
  }));
  eq(blocked.path, 'review', 'blocked: review path recorded');
  eq(blocked.block_reason, 'MARGIN_BELOW_FLOOR', 'blocked: reason recorded');
  eq(blocked.block_detail, { margin: 0.084 }, 'blocked: detail preserved');
  eq(blocked.suggested_kb_id, 9001, 'blocked: lexical suggestion still linked');

  const lexical = telemetry.buildDecidedDetails(decidedInput({
    path: 'lexical',
    result: { classification_method: 'EXACT_MATCH', status: 'CLASSIFIED', kb_item_id: 9001, match_score: 1 },
    semantic: null,
    lexical: { classification_method: 'EXACT_MATCH', status: 'CLASSIFIED' },
  }));
  eq(lexical.semantic_margin, null, 'lexical: no semantic evidence on short-circuit');
  eq(lexical.block_reason, null, 'lexical: no block on short-circuit');

  const reviewed = telemetry.buildReviewedDetails({
    classificationId: 5001, finalFw: true, finalComplexityId: 3,
    levelCode: 'L3', suggestionMethod: 'SEMANTIC_CLASSIFICATION', suggestionKbId: 9001,
  });
  eq(reviewed.classification_id, 5001, 'reviewed: classification linked for join');
  eq(reviewed.final_level_code, 'L3', 'reviewed: final level recorded');

  eq(telemetry.scoreOutcome({
    suggestionComplexityId: 3, suggestionFw: true, finalComplexityId: 3, finalFw: true,
  }), 'CONFIRMED', 'outcome: matching review confirms');
  eq(telemetry.scoreOutcome({
    suggestionComplexityId: 3, suggestionFw: true, finalComplexityId: 2, finalFw: true,
  }), 'OVERRIDDEN', 'outcome: changed complexity overrides');
  eq(telemetry.scoreOutcome({
    suggestionComplexityId: 3, suggestionFw: true, finalComplexityId: 3, finalFw: false,
  }), 'OVERRIDDEN', 'outcome: flipped fw flag overrides');
  eq(telemetry.scoreOutcome({
    suggestionComplexityId: null, suggestionFw: null, finalComplexityId: 3, finalFw: true,
  }), 'NO_SUGGESTION', 'outcome: suggestion-less review excluded from rate');

  console.log(`test-classify-telemetry: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
