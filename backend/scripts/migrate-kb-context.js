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
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'alter_kb_context.sql'), 'utf8');
  await pool.query(sql);
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'kb_items'
       AND column_name IN ('machine_model_id', 'machine_model_version_id')
     ORDER BY column_name`
  );
  console.log('KB_CONTEXT_COLS: ' + JSON.stringify(cols.rows));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
