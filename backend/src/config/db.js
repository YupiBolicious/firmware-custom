const { Pool } = require('pg');

require('dotenv').config();

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === '1'
        ? { rejectUnauthorized: false }
        : false,
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT, 10) || 5432,
      database: process.env.PGDATABASE || 'firmware_custom',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
    });

module.exports = pool;
