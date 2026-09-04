const fs = require('fs');
const path = require('path');
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
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'alter_incremental_analyze.sql'), 'utf8');
  await pool.query(sql);
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'classifications'
       AND column_name IN ('input_hash', 'kb_version')
     ORDER BY column_name`
  );
  const ver = await pool.query(`SELECT version FROM kb_corpus_version WHERE id = 1`);
  console.log('CLASSIFICATION_COLS: ' + JSON.stringify(cols.rows));
  console.log('KB_CORPUS_VERSION: ' + JSON.stringify(ver.rows));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
