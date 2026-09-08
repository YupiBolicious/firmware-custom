const { Pool } = require('pg');
require('dotenv').config();
const { scorePair } = require('../src/services/classificationService');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const MATCH = [
  'TEL VAV Controller', 'TEL VAV controllers',
  'IP65 LED Lighting Fixture', 'IP65 LED light fixture',
  'Impact resistant glass panel for light', 'Impact-resistant glass panels',
  'Emergency stop button', 'Emergency stop buttons',
  'Motorized Sash Window', 'Motorised sash windows',
];
const NOMATCH = [
  'Quantum flux deflector calibration',
  'Change alarm setpoint configuration',
  'Menu tree modification',
  'Closed-loop control implementation',
  'Halogen floodlight',
  'sliding window frame',
];

(async () => {
  const kb = (await pool.query(
    `SELECT kb_code, title, description, keywords, fw_related, complexity_level_id,
            machine_model_id, machine_model_version_id FROM kb_items WHERE is_active = TRUE`
  )).rows;
  console.log(`KB_ROWS: ${kb.length}`);
  const tier = (s) => (s >= 0.6 ? 'AUTO' : (s >= 0.35 ? 'SUGGEST' : 'NEW'));
  for (const t of [...MATCH.map((x) => [x, 'want-AUTO']), ...NOMATCH.map((x) => [x, 'want-REVIEW'])]) {
    let best = null;
    for (const k of kb) {
      const r = scorePair(t[0], '', k, { machine_model_id: null, machine_model_version_id: null });
      if (!best || r.score > best.score) best = { kb: k.kb_code, score: r.score };
    }
    console.log(`${tier(best.score) === 'AUTO' ? 'MATCH  ' : tier(best.score) === 'SUGGEST' ? 'SUGGEST' : 'NOMATCH'} "${t[0]}" -> ${best.kb}@${best.score.toFixed(2)} (expect ${t[1]})`);
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
