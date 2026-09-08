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
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS n FROM classifications GROUP BY status ORDER BY status`
  );
  r.rows.forEach((x) => console.log(`${x.status}: ${x.n}`));
  const u = await pool.query(`SELECT COUNT(*)::int AS n FROM classifications WHERE reviewed_by = 2`);
  console.log('reviewed_by_coder2: ' + u.rows[0].n);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
