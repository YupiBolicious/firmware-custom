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
  const wo = await pool.query(
    `SELECT id, wo_number, title, status,
            (SELECT COUNT(*)::int FROM work_order_items WHERE work_order_id = work_orders.id) AS items,
            (SELECT COUNT(*)::int FROM classifications c
             JOIN work_order_items woi ON woi.id = c.work_order_item_id
             WHERE woi.work_order_id = work_orders.id) AS classified
     FROM work_orders WHERE wo_number ILIKE '%test-02%' OR wo_number ILIKE '%test-03%'
     ORDER BY id`
  );
  wo.rows.forEach((r) => console.log(JSON.stringify(r)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
