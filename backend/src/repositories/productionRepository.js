const pool = require ('../config/db');

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

    const currentResult = await client.query(
      `SELECT * FROM work_orders WHERE id = $1 FOR UPDATE`,
      [workOrderId]
    );
    const current = currentResult.rows[0];
    if (!current || current.status !== 'ANALYZED') {
      throw new Error('Work order is no longer in ANALYZED state');
    }

    const summaryResult = await client.query(
      `SELECT COUNT(woi.id)::int AS item_count,
              COUNT(*) FILTER (
                WHERE c.id IS NULL OR c.status = 'CODER_REVIEW' OR c.fw_related IS NULL
              )::int AS unresolved_count,
              COALESCE(BOOL_OR(c.fw_related IS TRUE), FALSE) AS has_firmware
       FROM work_order_items woi
       LEFT JOIN classifications c ON c.work_order_item_id = woi.id
       WHERE woi.work_order_id = $1`,
      [workOrderId]
    );
    const summary = summaryResult.rows[0];
    if (summary.item_count === 0) throw new Error('Work order has no items to finalize');
    if (summary.unresolved_count > 0) throw new Error('Work order has items awaiting coder review');

    const nextStatus = summary.has_firmware ? 'FINALIZED' : 'COMPLETED';
    const workOrderResult = await client.query(
      `UPDATE work_orders SET status = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'ANALYZED' RETURNING *`,
      [workOrderId, nextStatus]
    );
    if (workOrderResult.rows.length === 0) {
      throw new Error('Work order is no longer in ANALYZED state');
    }

    let productionTasks = [];
    if (summary.has_firmware) {
      const taskResult = await client.query(
        `INSERT INTO production_tasks
           (task_code, work_order_id, work_order_item_id, title, description)
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
           description = EXCLUDED.description,
           updated_at = NOW()
         RETURNING id, task_code, work_order_id, work_order_item_id, title, description, completed,
                   created_at, updated_at`,
        [workOrderId]
      );
      productionTasks = taskResult.rows;
    } else {
      await client.query(
        'DELETE FROM production_tasks WHERE work_order_id = $1 RETURNING id',
        [workOrderId]
      );
    }

    await client.query('COMMIT');
    return {
      workOrder: workOrderResult.rows[0],
      productionTasks,
      completionPath: summary.has_firmware ? 'PRODUCTION' : 'NO_FIRMWARE',
      itemCount: summary.item_count,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
    findProductionTasksByWorkOrderId,
    findProductionTaskById,
    completeProductionTask,
    countProductionTasksByWorkOrderId,
    deleteProductionTasksByWorkOrderId,
    finalizeWithProductionTasks,
};