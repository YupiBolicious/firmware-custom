const { Pool } = require('pg');
require('dotenv').config();
const { bumpCorpusVersion } = require('../src/repositories/kbRepository');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const apply = process.argv.includes('--apply');

(async () => {
  const rows = (await pool.query(
    `SELECT kb.id, kb.kb_code, woi.id AS item_id,
            g.machine_model_id, g.machine_model_version_id,
            kb.machine_model_id AS kb_model, kb.machine_model_version_id AS kb_version
     FROM kb_items kb
     JOIN work_order_items woi ON woi.id = NULLIF(REGEXP_REPLACE(kb.kb_code, '^KB-CODER-', ''), '')::int
     LEFT JOIN work_order_groups g ON g.id = woi.work_order_group_id
     WHERE kb.kb_code LIKE 'KB-CODER-%' AND kb.is_active = TRUE
     ORDER BY kb.kb_code`
  )).rows;

  let changed = 0;
  for (const r of rows) {
    if (r.kb_model === r.machine_model_id && r.kb_version === r.machine_model_version_id) continue;
    changed++;
    console.log(`${apply ? 'APPLY' : 'DRYRUN'} ${r.kb_code}: model ${r.kb_model}/${r.kb_version} -> ${r.machine_model_id}/${r.machine_model_version_id}`);
    if (apply) {
      await pool.query(
        `UPDATE kb_items SET machine_model_id = $2, machine_model_version_id = $3, updated_at = NOW() WHERE id = $1`,
        [r.id, r.machine_model_id, r.machine_model_version_id]
      );
    }
  }
  console.log(`${apply ? 'APPLIED' : 'WOULD_CHANGE'}: ${changed}/${rows.length} rows`);
  if (apply && changed > 0) {
    console.log('KB_CORPUS_VERSION: ' + (await bumpCorpusVersion()));
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
