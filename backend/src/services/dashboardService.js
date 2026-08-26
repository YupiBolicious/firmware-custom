const pool = require('../config/db');

const getDashboard = async () => {
  const [woResult, itemResult, classifiedResult, reviewResult, hoursResult] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM work_orders`),
    pool.query(`SELECT COUNT(*)::int AS count FROM work_order_items`),
    pool.query(`SELECT COUNT(*)::int AS count FROM classifications WHERE status IN ('CLASSIFIED', 'NON_FIRMWARE')`),
    pool.query(`SELECT COUNT(*)::int AS count FROM classifications WHERE status = 'CODER_REVIEW'`),
    pool.query(`SELECT COALESCE(SUM(ie.total_hours * woi.quantity), 0) AS total FROM item_estimations ie JOIN work_order_items woi ON woi.id = ie.work_order_item_id`),
  ]);

  return {
    total_work_orders: woResult.rows[0].count,
    total_items: itemResult.rows[0].count,
    classified_items: classifiedResult.rows[0].count,
    waiting_review: reviewResult.rows[0].count,
    total_estimated_hours: Number(hoursResult.rows[0].total),
  };
};

module.exports = { getDashboard };