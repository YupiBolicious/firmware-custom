const { Pool } = require('pg');
require('dotenv').config();
const estimationService = require('../src/services/estimationService');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

(async () => {
  const it = await pool.query(
    `SELECT woi.id, woi.documentation_readiness FROM work_order_items woi
     JOIN work_orders wo ON wo.id = woi.work_order_id
     WHERE wo.wo_number LIKE 'WO-TEST-DOC%' ORDER BY woi.id DESC LIMIT 1`
  );
  console.log('ITEM: ' + JSON.stringify(it.rows[0] || null));
  const r = await pool.query(`SELECT current_database() AS db, current_schema() AS schema`);
  console.log('DB: ' + JSON.stringify(r.rows[0]));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
