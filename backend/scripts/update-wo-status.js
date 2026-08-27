require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

(async () => {
  await pool.query(`COMMENT ON COLUMN work_orders.status IS 'DRAFT | ANALYZED | FINALIZED | PRODUCTION | COMPLETED'`);
  console.log('Schema comment updated');
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
