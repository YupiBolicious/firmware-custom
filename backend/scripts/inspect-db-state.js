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
  for (const t of ['users', 'complexity_levels', 'verification_levels', 'machine_model', 'machine_model_ver', 'work_orders', 'kb_items']) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
      console.log(`${t}: ${r.rows[0].n}`);
    } catch (e) { console.log(`${t}: MISSING (${e.message.split('\n')[0]})`); }
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
