const assert = require('assert');
const classificationService = require('../src/services/classificationService');
const { decideBest } = require('../src/services/decider');
const { scoreCandidates } = require('../src/services/matcher');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const kbRow = (id, code, title, keywords, fw, cx) => ({
  id, kb_code: code, title, description: '', keywords,
  fw_related: fw, complexity_level_id: cx, confidence_score: 90,
  machine_model_id: null, machine_model_version_id: null,
});
const rows = [
  kbRow(1, 'KB-A', 'BMS alarm connection', 'alarm,bms,connection', true, 3),
  kbRow(2, 'KB-B', 'Glass panel unit', 'glass,panel,unit', true, 2),
  kbRow(3, 'KB-C', 'Glassdoor enclosure', 'glassdoor,enclosure', true, 2),
  kbRow(4, 'KB-D', 'alpha beta gamma delta', 'alpha,beta,gamma,delta', true, 2),
];
const refs = { kbItems: rows, rules: [] };
const item = (title) => ({
  title, description: '', quantity: 1, machine_model_id: null, machine_model_version_id: null,
});
const ctx = { machine_model_id: null, machine_model_version_id: null };

(async () => {
  const cov = scoreCandidates('alarm bms', '', rows, ctx);
  eq(cov.coverageCount, 1, 'evidence: unique coverage counted');
  eq(cov.coveredKb && cov.coveredKb.kb_code, 'KB-A', 'evidence: covering row identified');
  ok(cov.sharedCount >= 2, 'evidence: shared tokens counted');
  ok(typeof cov.lexicalMargin === 'number', 'evidence: lexical margin reported');

  const multi = scoreCandidates('glass panel', '', rows, ctx);
  eq(multi.coverageCount, 1, 'evidence: glass panel uniquely covered in this fixture');

  const vAuto = decideBest({
    bestKb: rows[3], bestKbScore: 0.5, bestKbBonus: 0, bestKbJTitle: 0.4,
    coverageCount: 1, coveredKb: rows[3], sharedCount: 2, rules: [], text: 'alpha beta',
  });
  eq(vAuto.classification_method, 'LEXICAL_SIMILARITY', 'policy: unique coverage auto-claims in band');
  eq(vAuto.status, 'CLASSIFIED', 'policy: auto, not review');
  eq(vAuto.kb_item_id, 4, 'policy: claims the covering row');

  const vMulti = decideBest({
    bestKb: rows[1], bestKbScore: 0.5, bestKbBonus: 0, bestKbJTitle: 0.4,
    coverageCount: 2, coveredKb: rows[1], sharedCount: 2, rules: [], text: 'glass panel',
  });
  eq(vMulti.classification_method, 'SIMILARITY', 'policy: multi-coverage stays review');
  eq(vMulti.status, 'CODER_REVIEW', 'policy: review-routed');

  const vSingle = decideBest({
    bestKb: rows[0], bestKbScore: 0.5, bestKbBonus: 0, bestKbJTitle: 0.4,
    coverageCount: 1, coveredKb: rows[0], sharedCount: 1, rules: [], text: 'alarm',
  });
  eq(vSingle.status, 'CODER_REVIEW', 'policy: single shared token never auto-claims');

  const vWeak = decideBest({
    bestKb: rows[0], bestKbScore: 0.2, bestKbBonus: 0, bestKbJTitle: 0.1,
    coverageCount: 1, coveredKb: rows[0], sharedCount: 2, rules: [], text: 'alarm bms spare procurement unit assembly kit',
  });
  eq(vWeak.classification_method, 'MANUAL', 'policy: below-band stays manual');

  const e2e = await classificationService.classifyItem(item('alpha beta'), refs);
  eq(e2e.classification_method, 'LEXICAL_SIMILARITY', 'e2e: band case auto-claims via coverage');
  eq(e2e.kb_item_id, 4, 'e2e: correct row claimed');

  console.log(`test-coverage-rule: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
