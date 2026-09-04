const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const apply = process.argv.includes('--apply');

(async () => {
  const fks = await pool.query(
    `SELECT tc.table_name, kcu.column_name,
            rc.delete_rule AS on_delete
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'work_orders' AND ccu.column_name = 'id'
     ORDER BY tc.table_name`
  );
  console.log('FK_TO_WORK_ORDERS:');
  fks.rows.forEach((r) => console.log(`  ${r.table_name}.${r.column_name} ON DELETE ${r.on_delete}`));

  const wo = await pool.query(
    `SELECT id, wo_number, status FROM work_orders WHERE wo_number LIKE 'LIVETEST%' ORDER BY id`
  );
  console.log(`LIVETEST_WO: ${wo.rows.length}`);
  wo.rows.forEach((r) => console.log(`  #${r.id} ${r.wo_number} [${r.status}]`));
  if (wo.rows.length === 0) { await pool.end(); return; }

  const ids = wo.rows.map((r) => r.id);
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM work_order_groups WHERE work_order_id = ANY($1)) AS groups,
       (SELECT COUNT(*)::int FROM work_order_items WHERE work_order_id = ANY($1)) AS items,
       (SELECT COUNT(*)::int FROM work_order_access WHERE work_order_id = ANY($1)) AS access,
       (SELECT COUNT(*)::int FROM work_order_documents WHERE work_order_id = ANY($1)) AS documents,
       (SELECT COUNT(*)::int FROM production_tasks WHERE work_order_id = ANY($1)) AS tasks,
       (SELECT COUNT(*)::int FROM notifications WHERE entity_id = ANY($1)) AS notifications`,
    [ids]
  );
  console.log('RELATED_ROWS: ' + JSON.stringify(counts.rows[0]));
  const kb = await pool.query(`SELECT COUNT(*)::int AS n FROM kb_items WHERE kb_code LIKE 'KB-CODER-%' AND is_active = TRUE`);
  console.log(`KB_CODER_ROWS_KEPT: ${kb.rows[0].n} (learned knowledge is preserved, not deleted)`);

  if (!apply) {
    console.log('DRYRUN_COMPLETE (re-run with --apply to delete)');
    await pool.end();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM work_order_access WHERE work_order_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM notifications WHERE entity_id = ANY($1)`, [ids]);
    const del = await client.query(`DELETE FROM work_orders WHERE id = ANY($1) RETURNING id`, [ids]);
    await client.query('COMMIT');
    console.log(`DELETED_WO: ${del.rows.length}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const left = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number LIKE 'LIVETEST%'`);
  console.log('LIVETEST_REMAINING: ' + left.rows[0].n);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
