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
  const kb = await pool.query(`SELECT COUNT(*)::int AS n FROM kb_items WHERE is_active = TRUE`);
  console.log('KB_ACTIVE: ' + kb.rows[0].n);
  const rev = await pool.query(
    `SELECT woi.title, woi.description, woi.quantity,
            g.machine_model_id, g.machine_model_version_id,
            cl.code AS cx, c.status, c.reviewed_by, c.classification_method
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     WHERE c.reviewed_by IS NOT NULL
     ORDER BY woi.id`
  );
  console.log('REVIEWED_LABELED: ' + rev.rows.length);
  rev.rows.forEach((r) => console.log('  ' + JSON.stringify(r)));
  const auto = await pool.query(
    `SELECT woi.title, cl.code AS cx, c.status, c.classification_method
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     WHERE c.reviewed_by IS NULL
     ORDER BY woi.id LIMIT 20`
  );
  console.log('AUTO_CLASSIFIED: ' + auto.rows.length);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
