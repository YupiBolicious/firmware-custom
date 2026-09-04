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
    `SELECT kb_code, fw_related, complexity_level_id, confidence_score, source, is_active
     FROM kb_items
     WHERE kb_code IN ('KB-CODER-63','KB-CODER-67','KB-CODER-65','KB-CODER-69',
                       'KB-CODER-70','KB-CODER-56','KB-CODER-61','KB-CODER-66')
     ORDER BY kb_code`
  );
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  const c = await pool.query(`SELECT COUNT(*)::int AS active FROM kb_items WHERE is_active = TRUE`);
  console.log('ACTIVE_KB_COUNT: ' + c.rows[0].active);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
