const fs = require('fs');
const path = require('path');
const { scorePair, jaccard } = require('../src/services/classificationService');
const { tokenize, diceBigram, contextBonus } = require('../src/utils/tokenPolicy');
const kbCache = require('../src/services/kbCache');

const breakdown = (itemTitle, itemDesc, kb, ctx) => {
  const kbTokens = kb.tokens instanceof Set
    ? kb.tokens
    : tokenize(`${kb.title} ${kb.description || ''} ${kb.keywords || ''}`);
  const fullTokens = tokenize(`${itemTitle} ${itemDesc || ''}`);
  const titleTokens = tokenize(itemTitle);
  const fullText = `${itemTitle} ${itemDesc || ''}`.trim();
  const jFull = jaccard(fullTokens, kbTokens);
  const jTitle = jaccard(titleTokens, kbTokens);
  const dFull = diceBigram(fullText, kb.title || '');
  const dTitle = diceBigram(itemTitle, kb.title || '');
  const bonus = contextBonus(kb, itemCtx(ctx));
  const r = scorePair(itemTitle, itemDesc, kb, itemCtx(ctx));
  return { jFull, jTitle, dFull, dTitle, bonus, final: r.score, textScore: r.textScore };
};
const itemCtx = (ctx) => ctx;

(async () => {
  const prepared = await kbCache.getPreparedKb();
  const ctx = { machine_model_id: 1, machine_model_version_id: 1 };
  const byId = {};
  prepared.rows.forEach((r) => { byId[r.id] = r; });

  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const probes = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe-set.json'), 'utf8')).probes;

  const cases = [
    { id: 'MANDATORY', title: 'counter integration particle sampler', desc: '' },
    ...probes.map((p) => ({ id: `probe-${p.id}`, title: p.title, desc: p.desc || '' })),
    ...set.cases.map((c) => ({ id: c.id, title: c.title, desc: c.description || '' })),
  ];

  console.log('LOW-JACCARD/HIGH-FINAL CASES (full-text Jaccard < 0.5 AND final >= 0.6):');
  let n = 0;
  for (const c of cases) {
    let best = null;
    for (const k of prepared.rows) {
      const b = breakdown(c.title, c.desc, k, ctx);
      if (!best || b.final > best.final) best = { kb: k, ...b };
    }
    if (best.jFull < 0.5 && best.final >= 0.6) {
      n++;
      const path = best.final === Math.max(best.jFull, best.dFull, 0)
        && best.textScore === Math.max(
          Math.max(best.jFull, best.dFull),
          Math.max(best.jTitle, best.dTitle)) ? '' : '';
      const winner = best.dTitle >= best.dFull && best.dTitle >= best.jFull && best.dTitle >= best.jTitle
        ? 'TITLE-DICE' : best.dFull >= best.jFull && best.dFull >= best.jTitle
          ? 'FULL-DICE' : best.jTitle >= best.jFull ? 'TITLE-JACCARD' : 'FULL-JACCARD';
      void path;
      console.log(`${c.id}: final=${best.final.toFixed(2)} jFull=${best.jFull.toFixed(2)} ` +
        `jTitle=${best.jTitle.toFixed(2)} dFull=${best.dFull.toFixed(2)} dTitle=${best.dTitle.toFixed(2)} ` +
        `bonus=${best.bonus >= 0 ? '+' : ''}${best.bonus.toFixed(2)} via=${winner} kb=${best.kb.kb_code} | "${c.title}"`);
    }
  }
  console.log(`\nTOTAL: ${n} of ${cases.length} cases`);
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
