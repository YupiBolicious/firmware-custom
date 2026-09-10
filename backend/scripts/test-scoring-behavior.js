const assert = require('assert');
const { scorePair, jaccard } = require('../src/services/classificationService');
const { tokenize, diceBigram } = require('../src/utils/tokenPolicy');
const kbCache = require('../src/services/kbCache');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };

// Observational only: pins CURRENT scoring behavior for the known
// low-Jaccard/high-final pattern. If a future scoring change alters any of
// these, the test fails loudly so the change gets reviewed deliberately.
// It does not assert what the behavior SHOULD be.
(async () => {
  const prepared = await kbCache.getPreparedKb();
  const kb = prepared.rows.find((r) => r.kb_code === 'KB-1012');
  ok(!!kb, 'fixture row KB-1012 exists');
  const ctx = { machine_model_id: 1, machine_model_version_id: 1 };

  const title = 'counter integration particle sampler';
  const r = scorePair(title, '', kb, ctx);
  const jFull = jaccard(tokenize(title), kb.tokens);
  ok(jFull < 0.5, `full-text Jaccard stays weak (${jFull.toFixed(2)})`);
  ok(r.score >= 0.6, `final score still reaches auto tier (${r.score.toFixed(2)})`);
  ok(Math.abs(r.score - Math.min(1, r.textScore + r.bonus)) < 1e-9,
    'final equals min(1, textScore + bonus) — documents the composition formula');
  const dTitle = diceBigram(title, kb.title || '');
  ok(dTitle > jFull, `title-Dice (${dTitle.toFixed(2)}) exceeds full-text Jaccard — rescue path confirmed present`);
  console.log(`test-scoring-behavior: OK (${n} assertions) [observed: jFull=${jFull.toFixed(2)} dTitle=${dTitle.toFixed(2)} final=${r.score.toFixed(2)}]`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
