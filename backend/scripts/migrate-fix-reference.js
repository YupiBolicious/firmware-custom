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
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'alter_fix_reference.sql'), 'utf8');
  await pool.query(sql);
  const rows = await pool.query(
    `SELECT r.reference_code, r.title, cl.code AS level,
            LEFT(r.description, 40) AS description, LEFT(r.example_text, 40) AS example_text
     FROM complexity_level_reference r
     JOIN complexity_levels cl ON cl.id = r.complexity_level_id
     ORDER BY r.reference_code`
  );
  console.log('REF_COUNT: ' + rows.rows.length);
  rows.rows.forEach((r) => console.log('  ' + JSON.stringify(r)));
  const dup = await pool.query(
    `SELECT reference_code, COUNT(*) FROM complexity_level_reference GROUP BY 1 HAVING COUNT(*) > 1`
  );
  console.log('DUP_CODES: ' + dup.rows.length);
  const misleveled = await pool.query(
    `SELECT COUNT(*)::int AS n FROM complexity_level_reference r
     JOIN complexity_levels cl ON cl.id = r.complexity_level_id
     WHERE SUBSTRING(r.reference_code FROM 5 FOR 2) <> cl.code`
  );
  console.log('MISLEVELED: ' + misleveled.rows[0].n);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
