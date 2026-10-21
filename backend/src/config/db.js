const path = require('path');
const { Pool } = require('pg');
// require('dotenv').config();
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = pool;
