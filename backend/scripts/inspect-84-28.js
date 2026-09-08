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
    `SELECT kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, source
     FROM kb_items WHERE kb_code IN ('KB-CODER-84', 'KB-CODER-28') ORDER BY kb_code`
  );
  r.rows.forEach((x) => console.log(JSON.stringify(x)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
