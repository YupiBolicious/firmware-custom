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
    `SELECT woi.id, woi.item_number, woi.title, woi.quantity,
            g.machine_model_id, g.machine_model_version_id, g.serial_number,
            c.fw_related, cl.code AS cx
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     WHERE c.reviewed_by IS NOT NULL AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
     ORDER BY woi.title, woi.id`
  );
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
