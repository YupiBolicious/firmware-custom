const assert = require('assert');
const classificationService = require('../src/services/classificationService');
const shadowClassify = require('../src/services/shadowClassify');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const item = {
  title: 'Emergency stop button', description: '', quantity: 1,
  machine_model_id: 1, machine_model_version_id: 1,
};

(async () => {
  const wrapped = await shadowClassify.classifyWithShadow(item);
  ok(wrapped && wrapped.lexical && wrapped.final, 'shape: lexical + final present');
  ok('semantic' in wrapped, 'shape: semantic key present');
  ok('assist' in wrapped, 'shape: assist key present');

  const direct = await classificationService.classifyItem({ ...item });
  eq(wrapped.final, direct, 'parity: final equals direct classifyItem result');
  eq(wrapped.lexical, direct, 'parity: lexical equals direct classifyItem result');

  if (wrapped.semantic) {
    ok(Array.isArray(wrapped.semantic.topMatches), 'semantic: topMatches array');
    ok(wrapped.semantic.topMatches.length <= 3, 'semantic: top-K bounded');
    ok(typeof wrapped.semantic.margin === 'number', 'semantic: margin reported');
    ok(wrapped.semantic.embedMs >= 0, 'semantic: embed latency recorded');
    console.log(`semantic: top=${wrapped.semantic.topMatches.map((m) => `${m.kbCode}@${m.score.toFixed(3)}`).join(', ')}`);
  } else {
    console.log('semantic: null (worker unavailable — verdict unaffected, as designed)');
  }

  process.env.SEMANTIC_ENABLED = '0';
  const off = await shadowClassify.classifyWithShadow(item);
  eq(off.semantic, null, 'kill switch: semantic null when disabled');
  eq(off.final, await classificationService.classifyItem({ ...item }), 'kill switch: final intact when disabled');
  delete process.env.SEMANTIC_ENABLED;

  const on = await shadowClassify.classifyWithShadow(item);
  ok(on.final && on.final.status, 're-enabled: verdicts flow again');

  const weakItem = {
    title: 'Quantum flux deflector calibration', description: '', quantity: 1,
    machine_model_id: 1, machine_model_version_id: 1,
  };
  const weak = await shadowClassify.classifyWithShadow(weakItem);
  eq(weak.final.status, 'CODER_REVIEW', 'assist setup: weak item stays review-routed');
  if (weak.assist) {
    eq(weak.assist.classification_method, 'SEMANTIC_ASSIST', 'assist: suggestion tagged');
    eq(weak.assist.status, 'CODER_REVIEW', 'assist: never auto-claims');
    ok(weak.assist.kb_code && weak.assist.match_score > 0, 'assist: candidate attached');
    ok(weak.assist.semantic_margin >= 0.15, 'assist: margin meets floor');
    console.log(`assist: SUGGEST ${weak.assist.kb_code}@${weak.assist.match_score.toFixed(3)} margin=${weak.assist.semantic_margin.toFixed(3)}`);
  } else if (weak.semantic) {
    ok(weak.semantic.assistBlocked && Array.isArray(weak.semantic.assistBlocked.reasons),
      'assist blocked: reason recorded in shadow telemetry');
    console.log(`assist: BLOCKED [${weak.semantic.assistBlocked.reasons.join(',')}]`);
  } else {
    console.log('assist: skipped (semantic unavailable — verdict unaffected, as designed)');
  }

  process.env.SEMANTIC_ENABLED = '0';
  const offAssist = await shadowClassify.classifyWithShadow(weakItem);
  eq(offAssist.assist, null, 'kill switch: no assist when disabled');
  delete process.env.SEMANTIC_ENABLED;

  console.log(`test-shadow: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

process.on('unhandledRejection', () => {});
