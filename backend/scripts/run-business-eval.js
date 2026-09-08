const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const classificationService = require('../src/services/classificationService');
const kbCache = require('../src/services/kbCache');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const SET_PATH = path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json');

(async () => {
  const set = JSON.parse(fs.readFileSync(SET_PATH, 'utf8'));
  const levels = await pool.query(`SELECT id, code FROM complexity_levels`);
  const codeById = new Map(levels.rows.map((r) => [r.id, r.code]));
  const prepared = await kbCache.getPreparedKb();
  const kbCodeById = new Map(prepared.rows.map((r) => [r.id, r.kb_code]));
  console.log(`KB active rows: ${prepared.rowCount}`);

  let scored = 0;
  for (const c of set.cases) {
    const t0 = Date.now();
    const pred = await classificationService.classifyItem({
      title: c.title,
      description: c.description || '',
      quantity: c.quantity || 1,
      machine_model_id: c.machine_model_id ?? null,
      machine_model_version_id: c.machine_model_version_id ?? null,
    });
    c.prediction = {
      method: pred.classification_method,
      status: pred.status,
      complexity_code: pred.complexity_level_id ? codeById.get(pred.complexity_level_id) || null : null,
      match_score: pred.match_score,
      confidence_score: pred.confidence_score,
      kb_code: pred.kb_item_id ? kbCodeById.get(pred.kb_item_id) || null : null,
      rule_id: pred.rule_id || null,
      latency_ms: Date.now() - t0,
      scored_at: new Date().toISOString(),
    };
    scored++;
  }
  fs.writeFileSync(SET_PATH, JSON.stringify(set, null, 2));
  const cache = kbCache.cacheStats();
  console.log(`SCORED: ${scored}/${set.cases.length} predictions stored (expectations untouched)`);
  console.log(`KB cache: builds=${cache.builds} hits=${cache.hits}`);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
