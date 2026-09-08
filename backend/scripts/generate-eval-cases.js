const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const { normalize } = require('../src/utils/tokenPolicy');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const wordsOf = (s) => normalize(s || '').split(' ').filter(Boolean);
const reorder = (s) => { const w = wordsOf(s); return w.length > 1 ? [...w.slice(1), w[0]].join(' ') : s; };
const subset = (s) => { const w = wordsOf(s); return w.length > 2 ? w.slice(0, -1).join(' ') : s; };

const MANUAL_SYNONYMS = [
  { title: 'Display screen text update', category: 'synonym', note: 'display/screen variant of UI-text rows' },
  { title: 'Boot loop failure on startup', category: 'synonym', note: 'paraphrase with zero lexical overlap to any row (tests semantic gap)' },
  { title: 'Fails to start, restarts repeatedly', category: 'paraphrase', note: 'same meaning as above, different words' },
];

const NOVEL = [
  'Quantum flux deflector calibration',
  'Halogen floodlight retrofit kit',
  'Sliding window frame replacement',
  'Hydraulic lift cylinder reseal',
];

const blank = (id, title, description, category, generatedBy, sourceRow, model, version) => ({
  id, title, description: description || '', quantity: 1,
  machine_model_id: model, machine_model_version_id: version,
  category, generated_by: generatedBy, source_row: sourceRow,
  expected_complexity_code: null, expected_status: null,
  review_status: 'UNREVIEWED', failure_category: null, prediction: null,
});

(async () => {
  const kb = (await pool.query(
    `SELECT kb_code, title, description FROM kb_items WHERE is_active = TRUE ORDER BY kb_code`
  )).rows;
  await pool.end();

  const cases = [];
  let n = 0;
  const nid = () => `BIZ-${String(++n).padStart(3, '0')}`;

  kb.forEach((r) => {
    cases.push(blank(nid(), r.title, r.description || '', 'exact', 'mechanical-verbatim', r.kb_code, 1, 1));
  });
  kb.forEach((r, i) => {
    if (i % 2 === 0) cases.push(blank(nid(), reorder(r.title), r.description || '', 'paraphrase', 'mechanical-reorder', r.kb_code, 1, 1));
    else cases.push(blank(nid(), subset(r.title), r.description || '', 'paraphrase', 'mechanical-subset', r.kb_code, 1, 1));
  });
  for (const m of MANUAL_SYNONYMS) {
    cases.push(blank(nid(), m.title, '', m.category, 'manual-example', null, 1, 1));
  }
  for (const t of NOVEL) {
    cases.push(blank(nid(), t, '', 'unrelated', 'manual-example', null, 1, 1));
  }
  const tokenSets = kb.map((r) => ({ code: r.kb_code, cx: null, set: new Set(wordsOf(`${r.title} ${r.description || ''}`)) }));
  const seen = new Set();
  for (const a of tokenSets) {
    for (const b of tokenSets) {
      if (a.code >= b.code) continue;
      const shared = [...a.set].filter((t) => b.set.has(t) && t.length > 3);
      const key = shared.sort().join('+');
      if (shared.length >= 2 && !seen.has(key) && cases.length < 96) {
        seen.add(key);
        const ra = kb.find((r) => r.kb_code === a.code);
        cases.push(blank(nid(), shared.join(' '), `Overlaps ${a.code} and ${b.code}`, 'ambiguous', 'mechanical-shared-phrase', `${a.code}+${b.code}`, 1, 1));
        void ra;
      }
      if (cases.length >= 96) break;
    }
    if (cases.length >= 96) break;
  }
  kb.slice(0, 5).forEach((r) => {
    cases.push(blank(nid(), r.title, r.description || '', 'model-context', 'mechanical-null-model', r.kb_code, null, null));
  });

  const out = {
    version: 1,
    notes: 'Machine-generated inputs (mechanical transforms) + hand-listed probes. ALL expectations are null/UNREVIEWED until PM/expert review. Predictions are filled by run-business-eval.js; ground truth only by review-eval.js.',
    cases,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), JSON.stringify(out, null, 2));
  const byCat = {};
  cases.forEach((c) => { byCat[c.category] = (byCat[c.category] || 0) + 1; });
  console.log(`GENERATED: ${cases.length} cases ${JSON.stringify(byCat)}`);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
