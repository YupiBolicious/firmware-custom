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
    `SELECT woi.id, woi.item_number, woi.title, woi.description,
            c.fw_related, cl.code AS cx
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     WHERE c.reviewed_by IS NOT NULL AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
     ORDER BY woi.id`
  );
  r.rows.forEach((x) => console.log('ITEM', JSON.stringify(x)));
  const k = await pool.query(
    `SELECT kb_code, title, description, fw_related, complexity_level_id
     FROM kb_items WHERE kb_code IN ('KB-CODER-63','KB-CODER-65','KB-CODER-67','KB-CODER-69','KB-CODER-56')
     ORDER BY kb_code`
  );
  k.rows.forEach((x) => console.log('KB', JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
