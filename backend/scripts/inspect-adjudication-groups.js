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
  const lv = await pool.query(`SELECT id, code, name FROM complexity_levels ORDER BY id`);
  console.log('LEVELS:');
  lv.rows.forEach((x) => console.log(`  id=${x.id} ${x.code} ${x.name}`));

  const r = await pool.query(
    `SELECT woi.id AS item_id, wo.wo_number, woi.item_number, woi.title, woi.description,
            woi.quantity, g.machine_model_id, g.machine_model_version_id, g.serial_number,
            c.fw_related, cl.code AS cx, u.full_name AS reviewed_by, c.reviewed_at,
            c.classification_reason
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     JOIN work_orders wo ON wo.id = woi.work_order_id
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     LEFT JOIN users u ON u.id = c.reviewed_by
     WHERE c.reviewed_by IS NOT NULL AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
       AND woi.id IN (61,63,64,65,66,67,68,69,70)
     ORDER BY woi.title, woi.id`
  );
  console.log('GROUP_ITEMS:');
  r.rows.forEach((x) => console.log('  ' + JSON.stringify(x)));

  const k = await pool.query(
    `SELECT kb_code, title, fw_related, complexity_level_id, confidence_score, source, is_active, keywords
     FROM kb_items WHERE kb_code LIKE 'KB-CODER-%'
       AND (title ILIKE '%mergepoint%' OR title ILIKE '%set point alarm%' OR title ILIKE '%air flow direction%')
     ORDER BY kb_code`
  );
  console.log('GROUP_KB:');
  k.rows.forEach((x) => console.log('  ' + JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
