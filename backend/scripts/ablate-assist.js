const fs = require('fs');
const path = require('path');
const semanticAssist = require('../src/services/semanticAssist');

(async () => {
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const reviewed = set.cases.filter((c) => c.review_status === 'REVIEWED');

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
  const bucket = (code, status) => code || (status === 'NON_FIRMWARE' ? 'L0' : 'none');

  let engaged = 0, suggestCorrect = 0, suggestWrong = 0, blocked = 0;
  const lines = [];
  for (const c of reviewed) {
    const p = c.prediction;
    if (!p || p.status !== 'CODER_REVIEW') continue;
    engaged++;
    const item = { title: c.title, description: c.description || '', quantity: 1,
      machine_model_id: 1, machine_model_version_id: 1 };
    const weak = { status: p.status, classification_method: p.method, match_score: p.match_score };
    const assist = await semanticAssist.assistWithSemantic(item, weak);
    const expB = bucket(c.expected_complexity_code, c.expected_status);
    if (!assist) { blocked++; lines.push(`BLOCKED  ${c.id} "${c.title}" (exp ${expB})`); continue; }
    const semCode = cxByCode[assist.kb_code] || null;
    const semB = bucket(semCode, semCode === 'L0' ? 'NON_FIRMWARE' : 'CLASSIFIED');
    if (semB === expB) { suggestCorrect++; lines.push(`SUGGEST-OK  ${c.id} -> ${assist.kb_item_id} (${semB})`); }
    else { suggestWrong++; lines.push(`SUGGEST-WRONG ${c.id} -> ${assist.kb_item_id} (${semB}, exp ${expB})`); }
  }
  console.log(`ASSIST ABLATION: engaged=${engaged}/${reviewed.length} suggestCorrect=${suggestCorrect} suggestWrong=${suggestWrong} blocked=${blocked}`);
  lines.forEach((l) => console.log('  ' + l));
  await require('../src/services/embedder').shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
