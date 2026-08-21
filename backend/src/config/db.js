const path = require('path');
const { Pool } = require('pg');
// require('dotenv').config();
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE || 'firmware_custom',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
});

module.exports = pool;