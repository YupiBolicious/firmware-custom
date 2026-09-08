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
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'alter_doc_estimation.sql'), 'utf8');
  await pool.query(sql);
  const ver = await pool.query(`SELECT code, verification_mh, doc_required, doc_mh FROM verification_levels ORDER BY code`);
  console.log('VERIFICATION_LEVELS: ' + JSON.stringify(ver.rows));
  const map = await pool.query(
    `SELECT cl.code AS cx, v.code AS ver
     FROM complexity_verification_map m
     JOIN complexity_levels cl ON cl.id = m.complexity_level_id
     JOIN verification_levels v ON v.id = m.verification_level_id
     ORDER BY cl.code`
  );
  console.log('CX_MAP: ' + JSON.stringify(map.rows));
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'item_estimations'
       AND column_name IN ('verification_mh', 'documentation_mh')
     ORDER BY column_name`
  );
  console.log('ESTIMATION_COLS: ' + JSON.stringify(cols.rows.map((r) => r.column_name)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
