const fs = require('fs');
const path = require('path');
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
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'alter_doc_restore_verification.sql'), 'utf8');
  await pool.query(sql);
  const ver = await pool.query(`SELECT code, verification_mh, doc_mh FROM verification_levels ORDER BY code`);
  console.log('VERIFICATION_LEVELS: ' + JSON.stringify(ver.rows));
  const est = await pool.query(
    `SELECT work_order_item_id, verification_mh, doc_mh, total_hours FROM item_estimations ORDER BY work_order_item_id`
  );
  console.log('ESTIMATIONS: ' + JSON.stringify(est.rows));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
