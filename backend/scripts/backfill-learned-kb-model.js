// Backfill for learned KB rows (source='CODER_REVIEW'): the machine model was written
// from the item's work_order_group_id, which is NULL for work-order level items, so every
// learned row ended up unscoped. Resolves the model from the work order's groups instead.
// Usage: node scripts/backfill-learned-kb-model.js [--dry-run]
const pool = require('../src/config/db');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

(async () => {
  const rows = (
    await pool.query(
      `SELECT k.id, k.kb_code, k.title,
              g.machine_model_id, g.machine_model_version_id, mm.model_code
       FROM kb_items k
       LEFT JOIN work_order_items woi ON woi.id = split_part(k.kb_code, '-', 3)::int
       LEFT JOIN LATERAL (
         SELECT wg.machine_model_id, wg.machine_model_version_id
         FROM work_order_groups wg
         WHERE wg.id = woi.work_order_group_id
            OR (woi.work_order_group_id IS NULL AND wg.work_order_id = woi.work_order_id)
         ORDER BY CASE WHEN wg.id = woi.work_order_group_id THEN 0 ELSE 1 END, wg.id
         LIMIT 1
       ) g ON TRUE
       LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
       WHERE k.source = 'CODER_REVIEW' AND k.machine_model_id IS NULL
       ORDER BY k.id`
    )
  ).rows;

  if (rows.length === 0) {
    console.log('No learned KB rows without a machine model.');
    await pool.end();
    return;
  }

  const resolvable = rows.filter((r) => r.machine_model_id != null);
  const unresolved = rows.filter((r) => r.machine_model_id == null);

  for (const row of resolvable) {
    console.log(`${row.kb_code}  ${row.title}  ->  model=${row.model_code} (id=${row.machine_model_id})`);
  }
  for (const row of unresolved) {
    console.log(`${row.kb_code}  ${row.title}  ->  UNRESOLVED (source item/work order no longer exists)`);
  }

  if (DRY_RUN) {
    console.log('[dry-run] no rows updated.');
    await pool.end();
    return;
  }

  let updated = 0;
  for (const row of resolvable) {
    const res = await pool.query(
      `UPDATE kb_items
       SET machine_model_id = $2, machine_model_version_id = $3, updated_at = NOW()
       WHERE id = $1 AND machine_model_id IS NULL`,
      [row.id, row.machine_model_id, row.machine_model_version_id || null]
    );
    updated += res.rowCount;
  }

  if (updated > 0) {
    await pool.query('UPDATE kb_corpus_version SET version = version + 1 WHERE id = 1');
  }

  const remaining = (
    await pool.query(
      `SELECT count(*)::int AS c FROM kb_items WHERE source = 'CODER_REVIEW' AND machine_model_id IS NULL`
    )
  ).rows[0].c;
  console.log(`Updated ${updated} row(s). Learned rows still without a machine model: ${remaining}.`);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
