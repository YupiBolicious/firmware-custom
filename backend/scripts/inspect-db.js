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
  const t = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
  );
  console.log('TABLES:', t.rows.map((r) => r.tablename).join(', '));

  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='roles'"
  );
  console.log('roles cols:', cols.rows.map((r) => r.column_name).join(', '));

  await pool.end();
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});