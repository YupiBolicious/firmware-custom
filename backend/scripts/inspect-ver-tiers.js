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
  const d = await pool.query(
    `SELECT code, COUNT(*) AS n, COUNT(DISTINCT doc_mh) AS docs, COUNT(DISTINCT verification_mh) AS vers
     FROM verification_levels GROUP BY code ORDER BY code`
  );
  d.rows.forEach((r) => console.log(JSON.stringify(r)));
  const all = await pool.query(`SELECT id, code, verification_mh, doc_mh, is_active FROM verification_levels ORDER BY id`);
  all.rows.forEach((r) => console.log(JSON.stringify(r)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
