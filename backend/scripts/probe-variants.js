const { Pool } = require('pg');
require('dotenv').config();
const { scorePair } = require('../src/services/classificationService');
const policy = require('../src/utils/tokenPolicy');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

(async () => {
  const kb = (await pool.query(
    `SELECT kb_code, title, description, keywords, fw_related, complexity_level_id,
            machine_model_id, machine_model_version_id FROM kb_items WHERE is_active = TRUE`
  )).rows;
  for (const sample of ['Mergepoint', 'Merge Point', 'mergepoints', 'Merge Points', 'Quantum flux deflector']) {
    const ctx = { machine_model_id: 1, machine_model_version_id: 1 };
    let best = null;
    for (const k of kb) {
      const r = scorePair(sample, '', k, ctx);
      if (!best || r.score > best.score) best = { kb: k.kb_code, ...r };
    }
    const tier = best.score >= 0.6 ? 'AUTO' : (best.score >= 0.35 ? 'REVIEW-SUGGEST' : 'REVIEW-NEW');
    console.log(`"${sample}" -> ${best.kb} full=${best.fullScore.toFixed(2)} title=${best.titleScore.toFixed(2)} final=${best.score.toFixed(2)} ${tier}`);
  }
  for (const sample of [['Merge Points', 'Add mergepoints operational']]) {
    const ctx = { machine_model_id: 1, machine_model_version_id: 1 };
    let best = null;
    for (const k of kb) {
      const r = scorePair(sample[0], sample[1], k, ctx);
      if (!best || r.score > best.score) best = { kb: k.kb_code, ...r };
    }
    const tier = best.score >= 0.6 ? 'AUTO' : (best.score >= 0.35 ? 'REVIEW-SUGGEST' : 'REVIEW-NEW');
    console.log(`"${sample[0]}" + desc "${sample[1]}" -> ${best.kb} full=${best.fullScore.toFixed(2)} title=${best.titleScore.toFixed(2)} final=${best.score.toFixed(2)} ${tier}`);
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
