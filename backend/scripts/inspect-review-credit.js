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
    `SELECT u.username, COUNT(*)::int AS reviewed
     FROM classifications c JOIN users u ON u.id = c.reviewed_by
     GROUP BY u.username ORDER BY reviewed DESC`
  );
  console.log('REVIEW_CREDIT_BY_USER:');
  r.rows.forEach((x) => console.log(`  ${x.username}: ${x.reviewed}`));
  const a = await pool.query(
    `SELECT u.username, COUNT(*)::int AS n FROM audit_trail at
     LEFT JOIN users u ON u.id = at.user_id
     WHERE at.action = 'ITEM_REVIEWED' GROUP BY u.username ORDER BY n DESC`
  );
  console.log('AUDIT_ITEM_REVIEWED_BY_USER (history, incl. deleted WOs):');
  a.rows.forEach((x) => console.log(`  ${x.username}: ${x.n}`));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
