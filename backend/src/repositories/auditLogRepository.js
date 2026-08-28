const pool = require('../config/db');

const DEFAULT_LIMIT = 500;

const findAll = async (limit = DEFAULT_LIMIT) => {
  const result = await pool.query(
    `SELECT at.id, at.user_id, at.action, at.entity_type, at.entity_id, at.details,
            at.ip_address, at.created_at,
            u.full_name AS user_name,
            wo.id AS work_order_id,
            wo.wo_number,
            wo.title AS wo_title,
            woi.item_number
     FROM audit_trail at
     LEFT JOIN users u ON u.id = at.user_id
     LEFT JOIN work_orders wo ON wo.id::text = (
       CASE WHEN at.entity_type = 'WORK_ORDER' THEN at.entity_id::text
            ELSE at.details->>'work_order_id' END
     )
     LEFT JOIN work_order_items woi ON woi.id = at.entity_id AND at.entity_type = 'WORK_ORDER_ITEM'
     ORDER BY at.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

const findActions = async () => {
  const result = await pool.query(
    `SELECT DISTINCT action FROM audit_trail ORDER BY action`
  );
  return result.rows.map((r) => r.action);
};

const findUsers = async () => {
  const result = await pool.query(
    `SELECT DISTINCT u.id, u.full_name
     FROM audit_trail at
     JOIN users u ON u.id = at.user_id
     ORDER BY u.full_name`
  );
  return result.rows;
};

module.exports = { findAll, findActions, findUsers, DEFAULT_LIMIT };