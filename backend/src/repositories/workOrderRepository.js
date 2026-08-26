const pool = require('../config/db');

//work orders
const findAll = async () => {
  const result = await pool.query(
    `SELECT wo.id, wo.wo_number, wo.title, wo.description, wo.customer, wo.status,
            wo.created_by, wo.created_at, wo.updated_at,
            u.full_name AS created_by_name,
            COUNT(woi.id)::int AS item_count,
            COALESCE(SUM(ie.total_hours * woi.quantity), 0) AS total_estimated_hours
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     GROUP BY wo.id, u.full_name
     ORDER BY wo.created_at DESC`
  );
  return result.rows;
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT wo.id, wo.wo_number, wo.title, wo.description, wo.customer, wo.status,
            wo.created_by, wo.created_at, wo.updated_at,
            u.full_name AS created_by_name
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     WHERE wo.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const findCoderReviewQueue = async () => {
  const result = await pool.query(
    `SELECT woi.id AS item_id, woi.work_order_id, woi.item_number, woi.title,
            woi.description, wo.wo_number, wo.title AS work_order_title,
            c.classification_reason, c.status, c.created_at
     FROM work_order_items woi
     JOIN work_orders wo ON wo.id = woi.work_order_id
     JOIN classifications c ON c.work_order_item_id = woi.id
     WHERE c.status = 'CODER_REVIEW'
     ORDER BY c.created_at ASC, wo.id, woi.item_number`
  );
  return result.rows;
};

const findProductionTasksByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT id, task_code, work_order_id, work_order_item_id, title, description, status,
            created_at, updated_at
     FROM production_tasks
     WHERE work_order_id = $1
     ORDER BY id`,
    [workOrderId]
  );
  return result.rows;
};

const finalizeWithProductionTasks = async (workOrderId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const workOrderResult = await client.query(
      `UPDATE work_orders
       SET status = 'FINALIZED', updated_at = NOW()
       WHERE id = $1 AND status = 'ANALYZED'
       RETURNING *`,
      [workOrderId]
    );
    if (workOrderResult.rows.length === 0) {
      throw new Error('Work order is no longer in ANALYZED state');
    }

    const taskResult = await client.query(
      `INSERT INTO production_tasks
         (task_code, work_order_id, work_order_item_id, title, description)
       SELECT wo.wo_number || '-' || woi.item_number,
              wo.id,
              woi.id,
              woi.title,
              woi.description
       FROM work_orders wo
       JOIN work_order_items woi ON woi.work_order_id = wo.id
       JOIN classifications c ON c.work_order_item_id = woi.id
       WHERE wo.id = $1 AND c.fw_related = TRUE
       ON CONFLICT (work_order_item_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         updated_at = NOW()
       RETURNING id, task_code, work_order_id, work_order_item_id, title, description, status,
                 created_at, updated_at`,
      [workOrderId]
    );

    await client.query('COMMIT');
    return { workOrder: workOrderResult.rows[0], productionTasks: taskResult.rows };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const create = async ({ wo_number, title, description, customer, created_by }) => {
  const result = await pool.query(
    `INSERT INTO work_orders (wo_number, title, description, customer, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [wo_number, title, description || null, customer, created_by]
  );
  return result.rows[0];
};

const update = async (id, { title, description, customer, status }) => {
  const result = await pool.query(
    `UPDATE work_orders
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         customer = COALESCE($4, customer),
         status = COALESCE($5, status),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, title, description, customer, status]
  );
  return result.rows[0] || null;
};

// ---------- Work Order Items ----------
const findItemsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT woi.id, woi.work_order_id, woi.item_number, woi.title, woi.description,
            woi.quantity, woi.created_at, woi.updated_at,
            c.id AS classification_id, c.fw_related, c.complexity_level_id,
            c.classification_method, c.confidence_score, c.classification_reason, c.status AS classification_status,
            c.reviewed_by,
            cl.code AS complexity_code, cl.name AS complexity_name,
            ie.total_hours AS estimated_hours
     FROM work_order_items woi
     LEFT JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
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
    `SELECT woi.*, wo.wo_number, wo.status AS work_order_status
     FROM work_order_items woi
     JOIN work_orders wo ON wo.id = woi.work_order_id
     WHERE woi.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const createItem = async ({ work_order_id, item_number, title, description, quantity }) => {
  const result = await pool.query(
    `INSERT INTO work_order_items (work_order_id, item_number, title, description, quantity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [work_order_id, item_number, title, description || null, quantity || 1]
  );
  return result.rows[0];
};

const updateItem = async (id, { title, description, quantity }) => {
  const result = await pool.query(
    `UPDATE work_order_items
     SET title = COALESCE($2, title),
         description = COALESCE($3, description),
         quantity = COALESCE($4, quantity),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, title, description, quantity]
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
  findAll,
  findById,
  findCoderReviewQueue,
  findProductionTasksByWorkOrderId,
  finalizeWithProductionTasks,
  create,
  update,
  findItemsByWorkOrderId,
  findItemById,
  findItemWithWorkOrder,
  createItem,
  updateItem,
  deleteItem,
  countItemsByWorkOrderId,
};