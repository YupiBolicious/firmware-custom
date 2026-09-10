const fs = require('fs');
const path = require('path');
const { scorePair, jaccard } = require('../src/services/classificationService');
const { normalize, tokenize } = require('../src/utils/tokenPolicy');
const kbCache = require('../src/services/kbCache');

(async () => {
  const probes = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe-set.json'), 'utf8')).probes;
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const prepared = await kbCache.getPreparedKb();
  const ctx = { machine_model_id: 1, machine_model_version_id: 1 };

  const inputs = [
    ...probes.map((p) => ({ id: `probe-${p.id}`, title: p.title, desc: p.desc || '' })),
    ...set.cases.map((c) => ({ id: c.id, title: c.title, desc: c.description || '' })),
  ];

  let total = 0;
  const buckets = { TRUE_EXACT: [], NEAR_DUPLICATE: [], PARAPHRASE: [] };
  for (const inp of inputs) {
    let best = null;
    for (const k of prepared.rows) {
      const r = scorePair(inp.title, inp.desc, k, ctx);
      if (!best || r.score > best.score) best = { kb: k, ...r };
    }
    if (!best || best.score < 0.6) continue;
    total++;
    const normItem = normalize(`${inp.title} ${inp.desc}`);
    const normKb = normalize(`${best.kb.title} ${best.kb.description || ''}`);
    const itemTokens = tokenize(`${inp.title} ${inp.desc}`);
    const kbTokens = tokenize(`${best.kb.title} ${best.kb.description || ''} ${best.kb.keywords || ''}`);
    const inter = [...itemTokens].filter((t) => kbTokens.has(t));
    const detail = `${inp.id} score=${best.score.toFixed(2)} jac=${jaccard(itemTokens, kbTokens).toFixed(2)} ` +
      `shared=${inter.length}/${new Set([...itemTokens, ...kbTokens]).size} ` +
      `item="${(inp.title + ' ' + inp.desc).trim().slice(0, 60)}" kb=${best.kb.kb_code}:"${best.kb.title}"`;
    if (normItem === normKb && normItem.length > 0) buckets.TRUE_EXACT.push(detail);
    else if (jaccard(itemTokens, kbTokens) >= 0.8) buckets.NEAR_DUPLICATE.push(detail);
    else buckets.PARAPHRASE.push(detail);
  }

  console.log(`CASES_SCORED: ${inputs.length} | AT_OR_ABOVE_0.60: ${total}`);
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`\n${k} (${v.length}):`);
    v.slice(0, 25).forEach((d) => console.log('  ' + d));
    if (v.length > 25) console.log(`  ... and ${v.length - 25} more`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
