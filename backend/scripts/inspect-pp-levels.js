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
    `SELECT kb.kb_code, cl.code AS cx FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id
     WHERE kb.kb_code IN ('KB-1005','KB-1006','KB-1010','KB-1012','KB-1014','KB-1003','KB-1002','KB-1022','KB-1008','KB-1017')
     ORDER BY kb.kb_code`
  );
  r.rows.forEach((x) => console.log(`${x.kb_code}=${x.cx}`));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
