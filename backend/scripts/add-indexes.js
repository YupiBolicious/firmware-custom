require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_classifications_status ON classifications(status)`,
  `CREATE INDEX IF NOT EXISTS idx_classifications_reviewed_by_status ON classifications(reviewed_by, status)`,
  `CREATE INDEX IF NOT EXISTS idx_classifications_created_at ON classifications(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_classifications_reviewed_at ON classifications(reviewed_at) WHERE reviewed_at IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_work_order_items_work_order_id ON work_order_items(work_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_trail_action_created ON audit_trail(action, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_item_estimations_work_order_item_id ON item_estimations(work_order_item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_production_tasks_work_order_id ON production_tasks(work_order_id)`,
];

(async () => {
  for (const sql of indexes) {
    const name = sql.match(/CREATE INDEX IF NOT EXISTS (\S+)/)[1];
    await pool.query(sql);
    console.log(`OK  ${name}`);
  }
  console.log('All indexes applied.');
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
