const assert = require('assert');
const classificationService = require('../src/services/classificationService');
const classifyFlow = require('../src/services/classifyFlow');
const { PATH_LEXICAL, PATH_SEMANTIC, PATH_REVIEW } = require('../src/services/classifyFlow');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const item = (title, description) => ({
  title, description: description || '', quantity: 1,
  machine_model_id: 1, machine_model_version_id: 1,
});

(async () => {
  const strong = await classifyFlow.classifyFlow(item('Emergency stop button', 'Emergency stop button'));
  eq(strong.path, PATH_LEXICAL, 'routing: strong lexical takes lexical path');
  eq(strong.semantic, null, 'short-circuit: no semantic work on strong path');
  eq(strong.assist, null, 'short-circuit: no assist on strong path');
  eq(strong.result, await classificationService.classifyItem(item('Emergency stop button', 'Emergency stop button')),
    'parity: lexical path result equals direct classifyItem');

  const weak = await classifyFlow.classifyFlow(item('Quantum flux deflector calibration', ''));
  ok([PATH_SEMANTIC, PATH_REVIEW].includes(weak.path), 'routing: weak lexical leaves lexical path');
  if (weak.path === PATH_SEMANTIC) {
    eq(weak.result.classification_method, 'SEMANTIC_CLASSIFICATION', 'semantic path: decision verdict recorded');
    ok(['CLASSIFIED', 'NON_FIRMWARE'].includes(weak.result.status), 'semantic path: decision routes out of review');
    ok(weak.semantic && weak.semantic.margin >= 0.15, 'semantic path: margin evidence attached');
    console.log(`flow: semantic decision ${weak.result.classification_method}@${weak.result.match_score.toFixed(2)}`);
  } else {
    eq(weak.result.status, 'CODER_REVIEW', 'review path: weak stays review-routed');
    eq(weak.result, await classificationService.classifyItem(item('Quantum flux deflector calibration', '')),
      'parity: review-path verdict equals direct classifyItem (suggestion never overwrites)');
    console.log('flow: review path (decision blocked, assist may be attached)');
  }

  process.env.SEMANTIC_ENABLED = '0';
  const off = await classifyFlow.classifyFlow(item('Quantum flux deflector calibration', ''));
  eq(off.assist, null, 'kill switch: no assist when disabled');
  eq(off.result.status, 'CODER_REVIEW', 'kill switch: verdict intact when disabled');
  delete process.env.SEMANTIC_ENABLED;

  console.log(`test-classify-flow: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
