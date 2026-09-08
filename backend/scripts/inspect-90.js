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
    `SELECT kb_code, title, description, keywords, fw_related, complexity_level_id,
            confidence_score, source, is_active, machine_model_id
     FROM kb_items WHERE kb_code = 'KB-CODER-90'`
  );
  console.log(JSON.stringify(r.rows[0] || null));
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM kb_items WHERE is_active = TRUE`);
  console.log('ACTIVE_KB: ' + c.rows[0].n);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
