const fs = require('fs');
const path = require('path');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const kbCache = require('../src/services/kbCache');
const policy = require('../src/utils/tokenPolicy');

(async () => {
  const matrix = await semanticStore.getMatrix();
  const prepared = await kbCache.getPreparedKb();
  const titleOf = (code) => {
    const r = prepared.rows.find((x) => x.kb_code === code);
    return r ? `${r.title} ${r.description || ''}` : '';
  };
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const ids = ['BIZ-057', 'BIZ-058', 'BIZ-059', 'BIZ-060', 'BIZ-061', 'BIZ-062', 'BIZ-063', 'BIZ-065', 'BIZ-067'];
  for (const id of ids) {
    const c = set.cases.find((x) => x.id === id);
    const text = `${c.title} ${c.description || ''}`.trim();
    const vecs = await embedder.embed([text]);
    const res = semanticStore.retrieve(vecs[0], matrix, 3);
    const top = res.matches[0];
    if (!top) { console.log(`${id}: no candidates`); continue; }
    const g = policy.checkCodeAgreement(
      policy.extractCodeTokens(text), policy.extractCodeTokens(titleOf(top.kbCode)));
    const experimental = top.score >= 0.6 && res.margin >= 0.05 && g.pass;
    console.log(`${id} "${c.title}": top=${top.kbCode}@${top.score.toFixed(2)} margin=${res.margin.toFixed(2)} gate=${g.pass ? 'pass' : 'REJECT'} => experimental ${experimental ? 'SUGGESTS (harm)' : 'blocked'}`);
  }
  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
