const pool = require('../config/db');

const findUserIdsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT user_id FROM work_order_access WHERE work_order_id = $1 ORDER BY created_at`,
    [workOrderId]
  );
  return result.rows.map((r) => r.user_id);
};

const findGrantedByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT a.work_order_id, a.user_id, a.granted_by, a.created_at,
            u.username, u.email, u.full_name
     FROM work_order_access a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.work_order_id = $1
     ORDER BY a.created_at`,
    [workOrderId]
  );
  return result.rows;
};

const grant = async (workOrderId, userId, grantedBy) => {
  const result = await pool.query(
    `INSERT INTO work_order_access (work_order_id, user_id, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (work_order_id, user_id) DO NOTHING
     RETURNING *`,
    [workOrderId, userId, grantedBy]
  );
  return result.rows[0] || null;
};

const revoke = async (workOrderId, userId) => {
  const result = await pool.query(
    `DELETE FROM work_order_access WHERE work_order_id = $1 AND user_id = $2 RETURNING *`,
    [workOrderId, userId]
  );
  return result.rows[0] || null;
};

const hasAccess = async (workOrderId, userId) => {
  const result = await pool.query(
    `SELECT 1 FROM work_order_access WHERE work_order_id = $1 AND user_id = $2 LIMIT 1`,
    [workOrderId, userId]
  );
  return result.rowCount > 0;
};

module.exports = {
  findUserIdsByWorkOrderId,
  findGrantedByWorkOrderId,
  grant,
  revoke,
  hasAccess,
};
