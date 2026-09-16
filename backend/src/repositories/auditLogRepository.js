const pool = require('../config/db');

const DEFAULT_LIMIT = 500;

const FROM_CLAUSE = `FROM audit_trail at
     LEFT JOIN users u ON u.id = at.user_id
     LEFT JOIN work_orders wo ON wo.id = at.work_order_id
     LEFT JOIN work_order_items woi ON woi.id = at.entity_id AND at.entity_type = 'WORK_ORDER_ITEM'`;

const findAll = async ({ page = 1, limit = 50, search, action, userId, workOrderId, dateFrom, dateTo } = {}) => {
  const conds = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    const ph = `$${params.length}`;
    conds.push(`(at.action ILIKE ${ph} OR at.entity_type ILIKE ${ph} OR at.entity_id::text ILIKE ${ph}
      OR u.full_name ILIKE ${ph} OR wo.wo_number ILIKE ${ph} OR wo.title ILIKE ${ph}
      OR at.details->>'wo_number' ILIKE ${ph} OR at.details->>'item_number' ILIKE ${ph})`);
  }
  if (action) {
    params.push(action);
    conds.push(`at.action = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conds.push(`at.user_id = $${params.length}`);
  }
  if (workOrderId) {
    params.push(workOrderId);
    conds.push(`at.work_order_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conds.push(`at.created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    conds.push(`at.created_at < ($${params.length}::date + 1)`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const baseParams = params.slice();

  params.push(limit);
  const limitPh = `$${params.length}`;
  params.push((page - 1) * limit);
  const offsetPh = `$${params.length}`;

  const result = await pool.query(
    `SELECT at.id, at.user_id, at.action, at.entity_type, at.entity_id, at.details,
            at.ip_address, at.created_at,
            u.full_name AS user_name,
            wo.id AS work_order_id,
            wo.wo_number,
            wo.title AS wo_title,
            woi.item_number,
            COUNT(*) OVER()::int AS total
     ${FROM_CLAUSE}
     ${where}
     ORDER BY at.created_at DESC, at.id DESC
     LIMIT ${limitPh} OFFSET ${offsetPh}`,
    params
  );
  // ponytail: COUNT(*) OVER() forces a full scan+sort to compute total (~115ms @ 50k rows).
  // If audit_trail outgrows the purge cycle, split into indexed page-fetch + separate COUNT(*).
  let total = result.rows.length ? result.rows[0].total : 0;
  if (!result.rows.length) {
    const c = await pool.query(`SELECT COUNT(*)::int AS n ${FROM_CLAUSE} ${where}`, baseParams);
    total = c.rows[0].n;
  }
  return { rows: result.rows, total };
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

const findWorkOrders = async () => {
  const result = await pool.query(
    `SELECT DISTINCT wo.id AS work_order_id, wo.wo_number, wo.title AS wo_title
     FROM work_orders wo
     JOIN audit_trail at ON at.work_order_id = wo.id
     ORDER BY wo.wo_number`
  );
  return result.rows;
};

module.exports = { findAll, findActions, findUsers, findWorkOrders, DEFAULT_LIMIT };