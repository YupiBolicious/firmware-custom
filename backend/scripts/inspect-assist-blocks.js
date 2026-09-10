const fs = require('fs');
const path = require('path');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const kbCache = require('../src/services/kbCache');
const policy = require('../src/utils/tokenPolicy');

(async () => {
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const ids = ['BIZ-057', 'BIZ-058', 'BIZ-059', 'BIZ-060', 'BIZ-061', 'BIZ-062', 'BIZ-063', 'BIZ-065', 'BIZ-067'];
  const matrix = await semanticStore.getMatrix();
  const prepared = await kbCache.getPreparedKb();
  const titleOf = (code) => {
    const r = prepared.rows.find((x) => x.kb_code === code);
    return r ? `${r.title} ${r.description || ''}` : '';
  };
  for (const id of ids) {
    const c = set.cases.find((x) => x.id === id);
    const vecs = await embedder.embed([`${c.title} ${c.description || ''}`.trim()]);
    const res = semanticStore.retrieve(vecs[0], matrix, 3);
    const top = res.matches[0];
    const g = top ? policy.checkCodeAgreement(
      policy.extractCodeTokens(`${c.title} ${c.description || ''}`),
      policy.extractCodeTokens(titleOf(top.kbCode))) : null;
    console.log(`${id}: top=${top ? `${top.kbCode}@${top.score.toFixed(2)}` : 'none'} ` +
      `margin=${res.margin.toFixed(2)} gate=${g ? (g.pass ? 'pass' : 'REJECT[' + g.reasons.join(',') + ']') : '-'}`);
  }
  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
