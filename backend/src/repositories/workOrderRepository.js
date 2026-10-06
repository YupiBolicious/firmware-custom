const pool = require('../config/db');

//work orders
const findAll = async ({ page = 1, limit = 15 } = {}) => {
  const result = await pool.query(
    /* wo relation with model and version has to be deleted because it would interfere the classification.
     added new relation: to groupWO to get and store ids*/
    `SELECT wo.id, wo.wo_number, wo.title, wo.customer, wo.status,
            wo.created_by, wo.created_at, wo.updated_at,
            u.full_name AS created_by_name,
            COUNT(woi.id)::int AS item_count,
            COALESCE(SUM(COALESCE(ie.total_hours, 0) - COALESCE(ie.verification_mh, 0)), 0) AS total_estimated_hours,
            (SELECT string_agg(g.label, '; ')
             FROM (
               SELECT DISTINCT CONCAT_WS(' ', mm.model_code, mmv.version_code, NULLIF(g.serial_number, '')) AS label
               FROM work_order_groups g
               LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
               LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
               WHERE g.work_order_id = wo.id
             ) g
            ) AS group_summary,
            COUNT(*) OVER ()::int AS total
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     GROUP BY wo.id, u.full_name
     ORDER BY wo.created_at DESC, wo.id DESC
     LIMIT $1 OFFSET $2`
    , [limit, (page - 1) * limit]
  );
  return { items: result.rows, total: result.rows[0] ? result.rows[0].total : 0 };
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT wo.id, wo.wo_number, wo.title, wo.customer, wo.status, wo.notes,
            wo.created_by, wo.created_at, wo.updated_at,
            u.full_name AS created_by_name,
COALESCE((SELECT SUM(COALESCE(ie.total_hours, 0) - COALESCE(ie.verification_mh, 0))
                       FROM work_order_items woi
                       JOIN item_estimations ie ON ie.work_order_item_id = woi.id
                       WHERE woi.work_order_id = wo.id), 0) AS total_estimated_hours
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     WHERE wo.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const findByWoNumber = async (woNumber) => {
  const result = await pool.query(
    `SELECT id FROM work_orders WHERE wo_number = $1`,
    [woNumber]
  );
  return result.rows[0] || null;
};

const findCoderReviewQueue = async ({ page = 1, limit = 15 } = {}) => {
  const result = await pool.query(
    `SELECT woi.id AS item_id, woi.work_order_id, woi.work_order_group_id, woi.item_number, woi.title,
            woi.description, wo.wo_number, wo.title AS work_order_title,
            mm.model_code AS machine_model_code, mmv.version_code AS machine_model_version,
            g.serial_number,
            c.classification_reason, c.status, c.created_at,
            c.assist_kb_id, c.assist_kb_code, c.assist_match_score, c.assist_semantic_margin,
            c.assist_complexity_level_id, c.assist_fw_related, c.assist_response,
            c.review_reason, c.assist_blocked_reason,
            kb_s.title AS assist_kb_title,
            kb_s.confidence_score AS assist_kb_confidence_score,
            COUNT(*) OVER ()::int AS total
     FROM work_order_items woi
     LEFT JOIN work_order_groups g ON g.id = woi.work_order_group_id
     JOIN work_orders wo ON wo.id = woi.work_order_id
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
     LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
     JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN kb_items kb_s ON kb_s.id = c.assist_kb_id
     WHERE c.status = 'CODER_REVIEW'
     ORDER BY c.created_at ASC, wo.id, woi.item_number
     LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]
  );
  return { items: result.rows, total: result.rows[0] ? result.rows[0].total : 0 };
};

const findProductionTasksByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT id, task_code, work_order_id, work_order_item_id, title, completed,
            created_at, updated_at
     FROM production_tasks
     WHERE work_order_id = $1
     ORDER BY id`,
    [workOrderId]
  );
  return result.rows;
};

const findProductionTaskById = async (taskId) => {
  const result = await pool.query(
    `SELECT id, task_code, work_order_id, work_order_item_id, title, completed,
            created_at, updated_at
     FROM production_tasks
     WHERE id = $1`,
    [taskId]
  );
  return result.rows[0] || null;
};

const completeProductionTask = async (taskId, completed) => {
  const result = await pool.query(
    `UPDATE production_tasks
     SET completed = $2, updated_at = NOW()
     WHERE id = $1
       AND EXISTS (SELECT 1 FROM work_orders
                   WHERE id = production_tasks.work_order_id AND status = 'PRODUCTION')
     RETURNING id, task_code, work_order_id, work_order_item_id, title, completed,
               created_at, updated_at`,
    [taskId, completed]
  );
  return result.rows[0] || null;
};

const countProductionTasksByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE completed = FALSE)::int AS open
     FROM production_tasks
     WHERE work_order_id = $1`,
    [workOrderId]
  );
  return { total: result.rows[0].total, open: result.rows[0].open };
};

const deleteProductionTasksByWorkOrderId = async (workOrderId) => {
  const result = await pool.query('DELETE FROM production_tasks WHERE work_order_id = $1 RETURNING id', [workOrderId]);
  return result.rows.length;
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
         (task_code, work_order_id, work_order_item_id, title)
       SELECT wo.wo_number || '-' || woi.id AS task_code,
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
         updated_at = NOW()
       RETURNING id, task_code, work_order_id, work_order_item_id, title, completed,
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

const createWithGroups = async ({ wo_number, customer, created_by, groups, items }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const woResult = await client.query(
      `INSERT INTO work_orders (wo_number, customer, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [wo_number, customer, created_by]
    );
    const wo = woResult.rows[0];

    const createdGroups = [];
    for (const group of groups || []) {
      const groupResult = await client.query(
        `INSERT INTO work_order_groups (work_order_id, machine_model_id, serial_number)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [wo.id, group.machine_model_id, group.serial_number || null]
      );
      createdGroups.push(groupResult.rows[0]);
    }

    const createdItems = [];
    const usedNumbers = [];
    for (const item of items || []) {
      let { item_number } = item;
      if (!item_number) {
        let idx = 1;
        do {
          item_number = `i${idx}`;
          idx += 1;
        } while (usedNumbers.includes(item_number));
      }
      usedNumbers.push(item_number);
      const itemResult = await client.query(
        `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, quantity, documentation_readiness)
         VALUES ($1, NULL, $2, $3, $4, $5, $6)
         RETURNING *`,
        [wo.id, item_number, item.title, item.quantity || 1]
      );
      createdItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');
    return { ...wo, groups: createdGroups, items: createdItems };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const { ApiError } = require('../middleware/errorHandler');
      throw new ApiError(409, 'A group with this model/serial number already exists on the work order');
    }
    throw err;
  } finally {
    client.release();
  }
};

const update = async (id, { customer, status, notes }) => {
  const result = await pool.query(
    `UPDATE work_orders
     SET description = COALESCE($2, description),
         customer = COALESCE($3, customer),
         status = COALESCE($4, status),
         notes = COALESCE($5, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, description, customer, status, notes]
  );
  return result.rows[0] || null;
};

// ---------- Work Order Groups ----------
const findGroupsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT g.id, g.work_order_id, g.machine_model_id, g.machine_model_version_id,
            g.serial_number, g.created_at, g.updated_at,
            mm.model_code AS machine_model_code, mm.name AS machine_model_name,
            mmv.version_code AS machine_model_version,
            (SELECT COUNT(*)::int FROM work_order_items woi WHERE woi.work_order_group_id = g.id) AS item_count
     FROM work_order_groups g
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
     LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
     WHERE g.work_order_id = $1
     ORDER BY g.id`,
    [workOrderId]
  );
  return result.rows;
};

const findGroupById = async (id, workOrderId) => {
  const result = await pool.query(
    `SELECT * FROM work_order_groups WHERE id = $1 AND work_order_id = $2`,
    [id, workOrderId]
  );
  return result.rows[0] || null;
};

const createGroup = async ({ work_order_id, machine_model_id, serial_number }) => {
  try {
    const result = await pool.query(
      `INSERT INTO work_order_groups (work_order_id, machine_model_id, serial_number)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [work_order_id, machine_model_id, serial_number || null]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const { ApiError } = require('../middleware/errorHandler');
      throw new ApiError(409, 'This group (model/serial number) already exists on the work order');
    }
    throw err;
  }
};

const updateGroup = async (id, workOrderId, { machine_model_id, serial_number }) => {
  const result = await pool.query(
    `UPDATE work_order_groups
     SET machine_model_id = $3,
         serial_number = $4,
         updated_at = NOW()
     WHERE id = $1 AND work_order_id = $2
     RETURNING *`,
    [id, workOrderId, machine_model_id, serial_number || null]
  );
  return result.rows[0] || null;
};

const deleteGroup = async (id, workOrderId) => {
  const result = await pool.query(
    `DELETE FROM work_order_groups WHERE id = $1 AND work_order_id = $2 RETURNING id`,
    [id, workOrderId]
  );
  return result.rows[0] || null;
};

const countItemsByGroupId = async (groupId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM work_order_items WHERE work_order_group_id = $1`,
    [groupId]
  );
  return result.rows[0].count;
};

const findItemNumbersByGroupId = async (groupId) => {
  const result = await pool.query(
    `SELECT item_number FROM work_order_items WHERE work_order_group_id = $1`,
    [groupId]
  );
  return result.rows.map((r) => r.item_number);
};

const findItemNumbersByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT item_number FROM work_order_items WHERE work_order_id = $1`,
    [workOrderId]
  );
  return result.rows.map((r) => r.item_number);
};

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
             g.serial_number, mm.model_code AS machine_model_code,
             (COALESCE(ie.total_hours, 0) - COALESCE(ie.verification_mh, 0)) AS estimated_hours,
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
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
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
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [work_order_id, work_order_group_id, item_number, title, quantity || 1, documentation_readiness || null]
  );
  return result.rows[0];
};

const updateItem = async (id, { title, quantity, documentation_readiness }) => {
  const result = await pool.query(
    `UPDATE work_order_items
     SET title = COALESCE($2, title),
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

const updateStatus = async (id, status, fromStatus) => {
  const result = await pool.query(
    `UPDATE work_orders SET status = $2, updated_at = NOW()
     WHERE id = $1 AND ($3::text IS NULL OR status = $3)
     RETURNING *`,
    [id, status, fromStatus || null]
  );
  return result.rows[0] || null;
};

module.exports = {
  findAll,
  findById,
  findByWoNumber,
  findCoderReviewQueue,
  findProductionTasksByWorkOrderId,
  findProductionTaskById,
  completeProductionTask,
  countProductionTasksByWorkOrderId,
  deleteProductionTasksByWorkOrderId,
  finalizeWithProductionTasks,
  createWithGroups,
  update,
  findGroupsByWorkOrderId,
  findGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  countItemsByGroupId,
  findItemNumbersByGroupId,
  findItemNumbersByWorkOrderId,
  findItemsByWorkOrderId,
  findItemById,
  findItemWithWorkOrder,
  createItem,
  updateItem,
  deleteItem,
  countItemsByWorkOrderId,
  updateStatus,
};