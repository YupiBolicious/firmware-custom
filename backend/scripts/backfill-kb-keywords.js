const { Pool } = require('pg');
require('dotenv').config();
const policy = require('../src/utils/tokenPolicy');
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
    `SELECT id, kb_code, title, description, keywords FROM kb_items WHERE is_active = TRUE ORDER BY kb_code`
  )).rows;

  let changed = 0;
  for (const row of rows) {
    const oldWords = (row.keywords || '').split(',')
      .flatMap((s) => policy.normalize(s).split(' ').filter(Boolean));
    const fresh = new Set(policy.buildKeywords(row.title, row.description, '').split(',').filter(Boolean));
    const merged = new Set([
      ...oldWords.map((t) => policy.canonicalize(t)).filter((t) => t && !policy.FUNCTIONAL.has(t) && !policy.isNoise(t)),
      ...fresh,
    ]);
    const newKw = [...merged].sort().join(',');
    const oldKw = (row.keywords || '').split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
    if (oldKw !== newKw) {
      changed++;
      console.log(`${apply ? 'APPLY' : 'DRYRUN'} ${row.kb_code}: [${row.keywords || ''}] -> [${newKw}]`);
      if (apply) {
        await pool.query(`UPDATE kb_items SET keywords = $2, updated_at = NOW() WHERE id = $1`, [row.id, newKw]);
      }
    }
  }
  console.log(`${apply ? 'APPLIED' : 'WOULD_CHANGE'}: ${changed}/${rows.length} rows`);
  if (apply && changed > 0) {
    console.log('KB_CORPUS_VERSION: ' + (await bumpCorpusVersion()));
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
