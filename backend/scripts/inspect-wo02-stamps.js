const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
(async () => {
  const r = await pool.query(
    `SELECT woi.item_number, c.classification_method, c.status,
            c.input_hash IS NULL AS hash_null, c.kb_version, c.updated_at
     FROM classifications c JOIN work_order_items woi ON woi.id = c.work_order_item_id
     WHERE woi.work_order_id = 8 ORDER BY woi.id`
  );
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  const v = await pool.query(`SELECT version FROM kb_corpus_version WHERE id = 1`);
  console.log('CORPUS: ' + JSON.stringify(v.rows));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
