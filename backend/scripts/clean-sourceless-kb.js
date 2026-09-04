const { Pool } = require('pg');
require('dotenv').config();
const { bumpCorpusVersion } = require('../src/repositories/kbRepository');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const apply = process.argv.includes('--apply');

(async () => {
  const rows = (await pool.query(
    `SELECT kb.id, kb.kb_code, kb.source, kb.is_active,
            NULLIF(REGEXP_REPLACE(kb.kb_code, '^KB-CODER-', ''), '')::int AS item_id,
            EXISTS (
              SELECT 1 FROM work_order_items woi
              WHERE woi.id = NULLIF(REGEXP_REPLACE(kb.kb_code, '^KB-CODER-', ''), '')::int
            ) AS source_exists
     FROM kb_items kb
     WHERE kb.kb_code LIKE 'KB-CODER-%'
     ORDER BY kb.kb_code`
  )).rows;

  const deletable = rows.filter((r) => !r.source_exists && r.source !== 'ADJUDICATED');
  const keptAdjudicated = rows.filter((r) => !r.source_exists && r.source === 'ADJUDICATED');
  const alive = rows.filter((r) => r.source_exists);

  console.log(`SOURCELESS_NON_ADJUDICATED: ${deletable.length}`);
  deletable.forEach((r) => console.log(`  ${apply ? 'APPLY' : 'DRYRUN'} delete ${r.kb_code} [source=${r.source} active=${r.is_active}]`));
  console.log(`KEPT_ADJUDICATED: ${keptAdjudicated.map((r) => r.kb_code).join(', ') || '(none)'}`);
  console.log(`KEPT_ALIVE_SOURCE: ${alive.map((r) => r.kb_code).join(', ') || '(none)'}`);

  if (!apply) {
    console.log('DRYRUN_COMPLETE (re-run with --apply to delete)');
    await pool.end();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of deletable) {
      await client.query(`DELETE FROM kb_items WHERE id = $1`, [r.id]);
    }
    await client.query('COMMIT');
    console.log(`DELETED_KB: ${deletable.length}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  if (deletable.length > 0) {
    console.log('KB_CORPUS_VERSION: ' + (await bumpCorpusVersion()));
  }
  const left = await pool.query(`SELECT COUNT(*)::int AS n FROM kb_items WHERE kb_code LIKE 'KB-CODER-%'`);
  console.log('KB_CODER_REMAINING: ' + left.rows[0].n);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
