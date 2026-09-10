const fs = require('fs');
const path = require('path');
const classificationService = require('../src/services/classificationService');
const semanticAssist = require('../src/services/semanticAssist');
const embedder = require('../src/services/embedder');

(async () => {
  const { Pool } = require('pg');
  require('dotenv').config();
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const lvAll = await pool.query(
    `SELECT kb.kb_code, cl.code AS cx FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id WHERE kb.is_active = TRUE`);
  const cxByCode = Object.fromEntries(lvAll.rows.map((r) => [r.kb_code, r.cx]));
  await pool.end();
  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'paraphrase-probes.json'), 'utf8'));
  const out = [];
  for (const p of probes) {
    const item = { title: p.title, description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1 };
    const lexical = await classificationService.classifyItem(item);
    const row = {
      id: p.id, input: p.title, expectedKb: p.expectedKb, expectedLevel: p.expectedLevel,
      lexicalStatus: lexical.status, lexicalMethod: lexical.classification_method,
      lexicalScore: lexical.match_score, lexicalKb: null,
      assist: null, verdict: null,
    };
    if (lexical.status === 'CODER_REVIEW') {
      const assist = await semanticAssist.assistWithSemantic(item, lexical);
      if (!assist) {
        row.verdict = 'BLOCKED';
      } else {
        const level = cxByCode[assist.kb_code] || null;
        row.assist = { kb_code: assist.kb_code, score: assist.match_score, margin: assist.semantic_margin, level };
        row.verdict = (assist.kb_code === p.expectedKb) ? 'SUGGEST_CORRECT' : 'SUGGEST_WRONG';
      }
    } else {
      row.lexicalKb = null;
      row.verdict = 'LEXICAL_DECIDED';
    }
    out.push(row);
    console.log(`${row.id} lex=${lexical.status}@${Number(lexical.match_score || 0).toFixed(2)} -> ${row.verdict}` +
      (row.assist ? ` (${row.assist.kb_code}@${row.assist.score.toFixed(2)} margin=${row.assist.margin.toFixed(2)})` : ''));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'tests', 'evaluation', 'paraphrase-results.json'), JSON.stringify(out, null, 2));
  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
