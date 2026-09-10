const fs = require('fs');
const path = require('path');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const kbCache = require('../src/services/kbCache');
const policy = require('../src/utils/tokenPolicy');

const RULES = {
  strict: { label: 'margin>=0.15', scoreFloor: 0, marginFloor: 0.15 },
  experimental: { label: 'score>=0.60 AND margin>=0.05', scoreFloor: 0.6, marginFloor: 0.05 },
};

(async () => {
  const matrix = await semanticStore.getMatrix();
  const prepared = await kbCache.getPreparedKb();
  const titleOf = (code) => {
    const r = prepared.rows.find((x) => x.kb_code === code);
    return r ? `${r.title} ${r.description || ''}` : '';
  };
  const { Pool } = require('pg');
  require('dotenv').config();
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const lv = await pool.query(
    `SELECT kb.kb_code, cl.code AS cx FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id WHERE kb.is_active = TRUE`);
  const cxByCode = Object.fromEntries(lv.rows.map((r) => [r.kb_code, r.cx]));
  await pool.end();

  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'paraphrase-probes.json'), 'utf8'));
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const engagedIds = ['BIZ-057', 'BIZ-058', 'BIZ-059', 'BIZ-060', 'BIZ-061', 'BIZ-062', 'BIZ-063', 'BIZ-065', 'BIZ-067'];
  const engaged = set.cases.filter((c) => engagedIds.includes(c.id));

  const evaluate = async (title, desc, expectedKb, expectedLevel) => {
    const text = `${title} ${desc || ''}`.trim();
    const vecs = await embedder.embed([text]);
    const res = semanticStore.retrieve(vecs[0], matrix, 3);
    const top = res.matches[0];
    if (!top) return { rule: null, top: null, margin: res.margin, gate: null };
    const gate = policy.checkCodeAgreement(
      policy.extractCodeTokens(text), policy.extractCodeTokens(titleOf(top.kbCode)));
    return { top, margin: res.margin, gate, expectedKb, expectedLevel };
  };

  const applyRule = (ev, rule) => {
    if (!ev.top) return 'BLOCKED_NO_CANDIDATE';
    if (ev.top.score < rule.scoreFloor) return 'BLOCKED_SCORE';
    if (ev.margin < rule.marginFloor) return 'BLOCKED_MARGIN';
    if (!ev.gate.pass) return 'BLOCKED_GATE';
    return 'SUGGEST';
  };

  for (const [key, rule] of Object.entries(RULES)) {
    let correct = 0, wrong = 0, blockedCorrect = 0;
    const wrongList = [];
    const blockedList = [];
    for (const p of probes) {
      const ev = await evaluate(p.title, '', p.expectedKb, null);
      const out = applyRule(ev, rule);
      const expLevel = { 'KB-1004': 'L2', 'KB-1008': 'L2', 'KB-1023': 'L2', 'KB-1024': 'L2', 'KB-1006': 'L3', 'KB-1009': 'L3', 'KB-1005': 'L4', 'KB-1010': 'L4', 'KB-1011': 'L4', 'KB-1012': 'L4', 'KB-1014': 'L4', 'KB-1003': 'L0', 'KB-1002': 'L0' }[p.expectedKb];
      if (out === 'SUGGEST') {
        const topLevel = cxByCode[ev.top.kbCode] || null;
        const rowOk = ev.top.kbCode === p.expectedKb;
        const levelOk = topLevel === expLevel;
        if (rowOk) correct++;
        else { wrong++; wrongList.push(`${p.id} -> ${ev.top.kbCode}(${topLevel || '?'})@${ev.top.score.toFixed(2)} exp ${p.expectedKb}(${expLevel})`); }
        void levelOk;
      } else {
        const wouldBeRight = ev.top && ev.top.kbCode === p.expectedKb;
        if (wouldBeRight) blockedCorrect++;
        blockedList.push(`${p.id} ${out} (top ${ev.top ? `${ev.top.kbCode}@${ev.top.score.toFixed(2)}` : 'none'})`);
      }
    }
    // Safety control: the 9 engaged business cases (expected: no level) must stay blocked.
    let controlWrong = 0;
    for (const c of engaged) {
      const ev = await evaluate(c.title, c.description, null, null);
      const out = applyRule(ev, rule);
      if (out === 'SUGGEST') { controlWrong++; }
    }
    const recall = correct / probes.length;
    console.log(`\nRULE ${rule.label}:`);
    console.log(`  correct suggestion: ${correct}/${probes.length} | wrong suggestion: ${wrong}/${probes.length} | blocked-correct: ${blockedCorrect} | recall=${(recall * 100).toFixed(1)}%`);
    console.log(`  safety control (9 true-novels must stay blocked): ${controlWrong === 0 ? 'PASS (0 suggested)' : `FAIL (${controlWrong} suggested!)`}`);
    if (wrongList.length) { console.log('  wrong suggestions:'); wrongList.forEach((l) => console.log('    ' + l)); }
    console.log('  blocked cases:');
    blockedList.forEach((l) => console.log('    ' + l));
  }
  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
