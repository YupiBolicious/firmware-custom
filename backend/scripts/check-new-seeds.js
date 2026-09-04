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

(async () => {
  const kb = (await pool.query(
    `SELECT kb_code, title, description, keywords, fw_related, complexity_level_id,
            machine_model_id, machine_model_version_id FROM kb_items WHERE is_active = TRUE`
  )).rows;
  for (const code of ['KB-1001', 'KB-1002', 'KB-1003', 'KB-1004', 'KB-1005']) {
    const self = kb.find((k) => k.kb_code === code);
    let best = null;
    for (const k of kb) {
      if (k.kb_code === code) continue;
      const r = scorePair(self.title, self.description, k, { machine_model_id: null, machine_model_version_id: null });
      if (!best || r.score > best.score) best = { kb: k.kb_code, ...r };
    }
    console.log(`${code} "${self.title}": self-match=1.00(canonical) best-other=${best.kb} @ ${best.score.toFixed(2)}`);
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
