const pool = require('../config/db');
const { create } = require('./userRepository');

// ---------- Work Order Items ----------
const findItemsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT woi.id, woi.work_order_id, woi.work_order_group_id, woi.item_number, woi.title, 
            woi.quantity, woi.documentation_readiness, woi.created_at, woi.updated_at,
c.id AS classification_id, c.fw_related, c.complexity_level_id,
             c.classification_method, c.confidence_score, c.classification_reason, c.status AS classification_status,
             c.reviewed_by, c.input_hash, c.kb_version,
             c.assist_kb_id, c.assist_kb_code, c.assist_match_score, c.assist_semantic_margin,
             c.assist_complexity_level_id, c.assist_fw_related, c.assist_response,
             c.review_reason, c.assist_blocked_reason,
             cl.code AS complexity_code, cl.name AS complexity_name,
             g.serial_number, wm.model_code AS machine_model_code,
             wm.machine_model_id, wm.machine_model_version_id,
             COALESCE(ie.total_hours, 0) AS estimated_hours,
             ie.verification_mh, ie.total_hours AS estimation_total_hours,
             kbs.title AS assist_kb_title,
             clp.code AS assist_complexity_code,
             CASE
               WHEN c.status = 'CODER_REVIEW' AND c.assist_complexity_level_id IS NOT NULL AND ie.id IS NULL
               THEN COALESCE(clp.total_hours, 0)
               ELSE NULL
             END AS provisional_hours
     FROM work_order_items woi
     LEFT JOIN work_order_groups g ON g.id = woi.work_order_group_id
     LEFT JOIN LATERAL (
       SELECT wg.machine_model_id, wg.machine_model_version_id, wmm.model_code
       FROM work_order_groups wg
       LEFT JOIN machine_model wmm ON wmm.id = wg.machine_model_id
       WHERE wg.id = woi.work_order_group_id
          OR (woi.work_order_group_id IS NULL AND wg.work_order_id = woi.work_order_id)
       ORDER BY CASE WHEN wg.id = woi.work_order_group_id THEN 0 ELSE 1 END, wg.id
       LIMIT 1
     ) wm ON TRUE
     LEFT JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     LEFT JOIN kb_items kbs ON kbs.id = c.assist_kb_id
     LEFT JOIN complexity_levels clp ON clp.id = c.assist_complexity_level_id
     WHERE woi.work_order_id = $1
     ORDER BY woi.item_number`,
    [workOrderId]
  );
  return result.rows;
};

const findItemById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM work_order_items WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const findItemWithWorkOrder = async (id) => {
  const result = await pool.query(
    `SELECT woi.*, wo.wo_number, wo.status AS work_order_status, wo.created_by AS wo_created_by
     FROM work_order_items woi
     JOIN work_orders wo ON wo.id = woi.work_order_id
     WHERE woi.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const createItem = async ({ work_order_id, work_order_group_id, item_number, title, quantity, documentation_readiness }) => {
  const result = await pool.query(
    `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, quantity, documentation_readiness)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [work_order_id, work_order_group_id, item_number, title, quantity || 1, documentation_readiness || null]
  );
  return result.rows[0];
};

const updateItem = async (id, { title, description, quantity, documentation_readiness }) => {
  const result = await pool.query(
    `UPDATE work_order_items
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         quantity = COALESCE($4, quantity),
         documentation_readiness = COALESCE($5, documentation_readiness),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, title, description, quantity, documentation_readiness]
  );
  return result.rows[0] || null;
};

const deleteItem = async (id) => {
  const result = await pool.query(
    `DELETE FROM work_order_items WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

const countItemsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM work_order_items WHERE work_order_id = $1`,
    [workOrderId]
  );
  return result.rows[0].count;
};

module.exports = {
    findItemsByWorkOrderId,
    findItemById,
    findItemWithWorkOrder,
    createItem,
    updateItem,
    deleteItem,
    countItemsByWorkOrderId,
};