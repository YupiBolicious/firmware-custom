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
  const fk = await pool.query(
    `SELECT tc.table_name, kcu.column_name, tc.constraint_type
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = 'complexity_level_reference'`
  );
  console.log('CONSTRAINTS on table:');
  fk.rows.forEach((r) => console.log('  ' + JSON.stringify(r)));
  const refs = await pool.query(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'complexity_level_reference'`
  );
  console.log('INBOUND_FKS (other tables -> this table): ' + refs.rows.length);
  refs.rows.forEach((r) => console.log('  ' + JSON.stringify(r)));
  const idx = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'complexity_level_reference'`
  );
  console.log('INDEXES: ' + idx.rows.map((r) => r.indexname).join(', '));
  const views = await pool.query(
    `SELECT viewname FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema')
     AND definition ILIKE '%complexity_level_reference%'`
  );
  console.log('VIEWS referencing table: ' + views.rows.length);
  const cols = await pool.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'complexity_level_reference' ORDER BY ordinal_position`
  );
  console.log('COLUMNS:');
  cols.rows.forEach((r) => console.log('  ' + JSON.stringify(r)));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
