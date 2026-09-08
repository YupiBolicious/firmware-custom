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
    `SELECT kb.kb_code, kb.title, cl.code AS cx, kb.confidence_score, kb.source, kb.is_active
     FROM kb_items kb LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id
     WHERE kb.kb_code IN ('KB-1002','KB-1003','KB-1004','KB-1005','KB-CODER-70','KB-CODER-84','KB-0001')
     ORDER BY kb.kb_code`
  );
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
