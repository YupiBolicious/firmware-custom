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

const FIXES = [
  ['KB-1011', 'change,inflow,setpoint'],
  ['KB-1012', 'air,bore,counter,integration,iso,tr,particle,sampler,smooth'],
  ['KB-1013', 'customized,epoxy,resin,ss304,upgrade,worktop'],
  ['KB-1019', '2pcs,ethernet,ports'],
  ['KB-1022', 'led,light,lux,minimum'],
];
const FIXED_CODES = new Set(FIXES.map(([c]) => c));
const normKw = (kw) => kw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).join(',');

const apply = process.argv.includes('--apply');

(async () => {
  for (const [code] of FIXES) {
    const r = await pool.query(`SELECT keywords FROM kb_items WHERE kb_code = $1`, [code]);
    console.log(`${apply ? 'APPLY' : 'DRYRUN'} ${code}: [${r.rows[0].keywords}]`);
  }
  const all = await pool.query(`SELECT kb_code, keywords FROM kb_items WHERE is_active = TRUE ORDER BY kb_code`);
  let normalizeCount = 0;
  for (const row of all.rows) {
    if (FIXED_CODES.has(row.kb_code)) continue;
    if (normKw(row.keywords) !== row.keywords) {
      normalizeCount++;
      console.log(`${apply ? 'APPLY' : 'DRYRUN'} ${row.kb_code} case-normalize: [${row.keywords}] -> [${normKw(row.keywords)}]`);
    }
  }
  if (!normalizeCount) console.log('No case-normalization needed.');
  if (!apply) {
    console.log('DRYRUN_COMPLETE (re-run with --apply)');
    await pool.end();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [code, kw] of FIXES) {
      await client.query(`UPDATE kb_items SET keywords = $2, updated_at = NOW() WHERE kb_code = $1`, [code, kw]);
      console.log(`  wrote ${code}: [${kw}]`);
    }
    const allRows = (await client.query(`SELECT kb_code, keywords FROM kb_items WHERE is_active = TRUE`)).rows;
    for (const row of allRows) {
      if (FIXED_CODES.has(row.kb_code)) continue;
      const norm = normKw(row.keywords);
      if (norm === row.keywords) continue;
      await client.query(`UPDATE kb_items SET keywords = $2, updated_at = NOW() WHERE kb_code = $1`, [row.kb_code, norm]);
      console.log(`  normalized ${row.kb_code}: [${norm}]`);
    }
    await client.query('COMMIT');
    console.log('KB_CORPUS_VERSION: ' + (await bumpCorpusVersion()));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
