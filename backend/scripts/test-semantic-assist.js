const assert = require('assert');
const semanticAssist = require('../src/services/semanticAssist');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const policy = require('../src/utils/tokenPolicy');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const weak = { status: 'CODER_REVIEW', classification_method: 'MANUAL', match_score: 0 };
const item = (title) => ({ title, description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1 });

(async () => {
  const good = await semanticAssist.assistWithSemantic(item('Motorized Sash Window'), weak);
  ok(good !== null, 'positive: assist returned for weak lexical + strong semantic');
  eq(good.classification_method, 'SEMANTIC_ASSIST', 'positive: method tag');
  eq(good.status, 'CODER_REVIEW', 'positive: still requires review (no auto-claim)');
  ok(good.fw_related === null && good.complexity_level_id === null, 'positive: no level asserted');
  ok(good.kb_item_id != null && good.match_score > 0.6, 'positive: candidate attached');
  ok(good.semantic_margin >= 0.15, 'positive: margin meets floor');
  console.log(`positive: kb=${good.kb_item_id} score=${good.match_score.toFixed(3)} margin=${good.semantic_margin.toFixed(3)}`);

  const confident = await semanticAssist.assistWithSemantic(
    item('Motorized Sash Window'),
    { status: 'CLASSIFIED', classification_method: 'EXACT_MATCH', match_score: 1 });
  eq(confident, null, 'lexical-confident: no assist when lexical already decided');

  const marginFail = await semanticAssist.assistWithSemantic(item('Motorized Sash Window'), weak, { marginFloor: 0.99 });
  eq(marginFail, null, 'margin: null below floor');

  const codeCase = await semanticAssist.assistWithSemantic(item('Merge Point'), weak, { marginFloor: 0 });
  eq(codeCase, null, 'code-gate: null when candidate carries codes the item lacks');
  const matrix = await semanticStore.getMatrix();
  const vecs = await embedder.embed(['Merge Point']);
  const top = semanticStore.retrieve(vecs[0], matrix, 1);
  ok(top.matches.length > 0, 'code-gate evidence: a top candidate exists (margin alone would pass)');
  const kbCache = require('../src/services/kbCache');
  const prepared = await kbCache.getPreparedKb();
  const row = prepared.rows.find((r) => r.id === top.matches[0].kbId);
  const g = policy.checkCodeAgreement(
    policy.extractCodeTokens('Merge Point'),
    policy.extractCodeTokens(`${row.title} ${row.description || ''}`));
  ok(!g.pass, `code-gate evidence: gate rejects (${g.reasons.join(',')}) — null came from the gate, not the margin`);

  process.env.SEMANTIC_ENABLED = '0';
  const off = await semanticAssist.assistWithSemantic(item('Motorized Sash Window'), weak);
  eq(off, null, 'kill switch: null when disabled');
  delete process.env.SEMANTIC_ENABLED;

  await embedder.shutdown();
  const timedOut = await semanticAssist.assistWithSemantic(item('Motorized Sash Window'), weak, { timeoutMs: 50 });
  eq(timedOut, null, 'timeout: null while worker reloads (never throws)');

  const matrix2 = await semanticStore.getMatrix();
  const vecs2 = await embedder.embed(['Motorized Sash Window']);
  const precomputed = semanticStore.retrieve(vecs2[0], matrix2, 3);
  const viaPrecomputed = await semanticAssist.assistWithSemantic(item('Motorized Sash Window'), weak, { precomputed });
  const viaFresh = await semanticAssist.assistWithSemantic(item('Motorized Sash Window'), weak);
  eq(viaPrecomputed, viaFresh, 'precomputed: identical result with zero extra embeds');

  console.log(`test-semantic-assist: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
