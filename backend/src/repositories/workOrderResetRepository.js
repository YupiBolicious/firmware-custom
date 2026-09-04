const pool = require('../config/db');

const clearAnalysisByWorkOrderId = async (workOrderId) => {
  await pool.query(
    `DELETE FROM classification_matches
     WHERE classification_id IN (
       SELECT c.id FROM classifications c
       JOIN work_order_items woi ON woi.id = c.work_order_item_id
       WHERE woi.work_order_id = $1
     )`,
    [workOrderId]
  );
  await pool.query(
    `DELETE FROM classifications
     WHERE work_order_item_id IN (
       SELECT id FROM work_order_items WHERE work_order_id = $1
     )`,
    [workOrderId]
  );
  await pool.query(
    `DELETE FROM item_estimations
     WHERE work_order_item_id IN (
       SELECT id FROM work_order_items WHERE work_order_id = $1
     )`,
    [workOrderId]
  );
};

module.exports = { clearAnalysisByWorkOrderId };
