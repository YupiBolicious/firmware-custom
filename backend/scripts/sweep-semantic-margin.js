const fs = require('fs');
const path = require('path');
require('dotenv').config();
const classifyFlow = require('../src/services/classifyFlow');
const embedder = require('../src/services/embedder');

const floors = (process.argv[2] || '0,0.05,0.10,0.15,0.20').split(',').map(Number);

(async () => {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const kbAll = await pool.query('SELECT id, kb_code FROM kb_items WHERE is_active = TRUE');
  const codeById = Object.fromEntries(kbAll.rows.map((r) => [r.id, r.kb_code]));
  await pool.end();
  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'paraphrase-probes.json'), 'utf8'));
  const summary = [];
  for (const floor of floors) {
    process.env.SEMANTIC_MARGIN = String(floor);
    const counts = { CORRECT: 0, WRONG: 0, BLOCKED: 0, LEXICAL: 0 };
    const rows = [];
    for (const p of probes) {
      const item = { title: p.title, description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1 };
      const flowed = await classifyFlow.classifyFlow(item);
      const kb = flowed.result.kb_item_id != null ? (codeById[flowed.result.kb_item_id] || '?') : '-';
      const margin = flowed.semantic ? Number(flowed.semantic.margin.toFixed(3)) : null;
      let verdict;
      if (flowed.path === 'semantic') {
        verdict = kb === p.expectedKb ? 'CORRECT' : 'WRONG';
        counts[verdict]++;
      } else if (flowed.path === 'lexical') {
        verdict = 'LEXICAL';
        counts.LEXICAL++;
      } else {
        verdict = 'BLOCKED';
        counts.BLOCKED++;
      }
      rows.push({ id: p.id, expected: p.expectedKb, kb, margin, verdict });
      console.log(`floor=${floor} ${p.id} margin=${margin} kb=${kb} expected=${p.expectedKb} -> ${verdict}`);
    }
    summary.push({ floor, ...counts, rows });
    console.log(`floor=${floor}: CORRECT=${counts.CORRECT} WRONG=${counts.WRONG} BLOCKED=${counts.BLOCKED} LEXICAL=${counts.LEXICAL}`);
  }
  fs.writeFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'semantic-margin-sweep.json'),
    JSON.stringify(summary, null, 2));
  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
