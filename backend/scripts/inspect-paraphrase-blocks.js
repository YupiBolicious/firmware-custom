const fs = require('fs');
const path = require('path');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const kbCache = require('../src/services/kbCache');
const policy = require('../src/utils/tokenPolicy');

(async () => {
  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'paraphrase-probes.json'), 'utf8'));
  const matrix = await semanticStore.getMatrix();
  const prepared = await kbCache.getPreparedKb();
  const titleOf = (code) => {
    const r = prepared.rows.find((x) => x.kb_code === code);
    return r ? `${r.title} ${r.description || ''}` : '';
  };
  for (const p of probes) {
    const vecs = await embedder.embed([p.title]);
    const res = semanticStore.retrieve(vecs[0], matrix, 3);
    const top = res.matches[0];
    const g = top ? policy.checkCodeAgreement(
      policy.extractCodeTokens(p.title), policy.extractCodeTokens(titleOf(top.kbCode))) : null;
    console.log(`${p.id} exp=${p.expectedKb}(${p.expectedLevel}): ` +
      (top ? `top=${top.kbCode}@${top.score.toFixed(2)} margin=${res.margin.toFixed(2)} gate=${g.pass ? 'pass' : 'REJECT[' + g.reasons.join(',') + ']'}` : 'no candidates') +
      ` verdict=${!top || res.margin < 0.15 ? 'MARGIN_BLOCK' : (!g.pass ? 'GATE_BLOCK' : 'WOULD_SUGGEST')}`);
  }
  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
