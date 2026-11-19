const pool = require('../config/db');
const workOrderRepository = require('./workOrderRepository');
const { findById } = require('./workOrderRepository');

const assignCoder = async (workOrderId, coderId) => {
  const result = await pool.query(
    `UPDATE work_orders
     SET assigned_coder_id = $2,
     assigned_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END,
     updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [workOrderId, coderId]
  );
  return result.rows[0] || null;
};

const getCoderQueueHours = async (coderId, assigned_at, workOrderId) => {
  const result = await pool.query(
  // each WO contributes only its highest item estimate; the ETA is not a sum of all items
  `SELECT COALESCE(SUM(q.work_hours), 0) AS total_work_hours
    FROM (
      SELECT wo.id, COALESCE(MAX(ie.total_hours), 0) AS work_hours
      FROM work_orders wo
      LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
      LEFT JOIN item_estimations ie  ON ie.work_order_item_id = woi.id
      WHERE wo.assigned_coder_id = $1
      AND (wo.status IN ('FINALIZED','PRODUCTION','READY_TO_CLOSE') OR wo.id = $3)
      AND (wo.assigned_at <= $2::timestamptz + INTERVAL '1 second' OR wo.assigned_at IS NULL)
      GROUP BY wo.id
    ) q`,
    [coderId, assigned_at, workOrderId]
  );
  return result.rows[0] || null;
};

const setEstimatedCompletion = async (workOrderId, eta) => {
  const result = await pool.query(
    `UPDATE work_orders SET estimated_completion_date = $2::date
     WHERE id = $1 RETURNING id, estimated_completion_date`,
    [workOrderId, eta]
  );
  return result.rows[0] || null;
};

const updateStatus = async (id, status, fromStatus) => {
  const result = await pool.query(
    `UPDATE work_orders SET status = $2, updated_at = NOW()
     WHERE id = $1 AND ($3::text IS NULL OR status = $3)
     RETURNING id`,
    [id, status, fromStatus || null]
  );
  if (result.rowCount === 0) return null;
  return findById(id);
};

const updateStatusDirect = async (id, newStatus, expectedOldStatus = null) => {
  const params = [newStatus, id];
  let where = 'WHERE id = $2';
  if (expectedOldStatus) {
    params.push(expectedOldStatus);
    where += ` AND status = $${params.length}`;
  }
  const result = await pool.query(
    `UPDATE work_orders SET status = $1, updated_at = NOW() ${where} RETURNING id`,
    params
  );
  if (result.rowCount === 0) return null;
  return findById(id);
};

const transitionAdminStatus = async ({ id, fromStatus, toStatus, clearProductionTasks = false }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      'SELECT id, status FROM work_orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    const current = currentResult.rows[0];
    if (!current || current.status !== fromStatus) {
      await client.query('ROLLBACK');
      return null;
    }

    if (clearProductionTasks) {
      await client.query('DELETE FROM production_tasks WHERE work_order_id = $1', [id]);
    }

    const result = await client.query(
      `UPDATE work_orders SET status = $2, updated_at = NOW()
       WHERE id = $1 AND status = $3 RETURNING id`,
      [id, toStatus, fromStatus]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    await client.query('COMMIT');
    return findById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
    assignCoder, getCoderQueueHours, setEstimatedCompletion, updateStatus, updateStatusDirect, transitionAdminStatus,
};