const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

(async () => {
  try {
    await pool.query(sql);
  } catch (err) {
    console.error('Schema application failed:', err.message);
    process.exit(1);
  }
  console.log('SCHEMA APPLIED OK');
  await pool.end();
})().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});