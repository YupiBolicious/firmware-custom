const pool = require('../config/db');

//work orders
const findAll = async ({ page = 1, limit = 15, search = '', status = '', machineModelCode = '', complexity = '', classificationStatus = '', from = '', to = '' } = {}) => {
  const params = [];
  const conditions = [];

  if (status && status !== 'ALL') {
    params.push(status);
    conditions.push(`wo.status = $${params.length}`);
  }
  if (machineModelCode && machineModelCode !== 'ALL') {
    params.push(machineModelCode);
    conditions.push(`EXISTS (
      SELECT 1 FROM work_order_groups wmg
      JOIN machine_model mmg ON mmg.id = wmg.machine_model_id
      WHERE wmg.work_order_id = wo.id AND mmg.model_code = $${params.length}
    )`);
  }
  if (complexity && complexity !== 'ALL') {
    params.push(complexity);
    conditions.push(`EXISTS (
      SELECT 1 FROM work_order_items wci
      JOIN classifications cci ON cci.work_order_item_id = wci.id
      JOIN complexity_levels clci ON clci.id = cci.complexity_level_id
      WHERE wci.work_order_id = wo.id AND clci.code = $${params.length}
    )`);
  }
  if (classificationStatus && classificationStatus !== 'ALL') {
    params.push(classificationStatus);
    conditions.push(`EXISTS (
      SELECT 1 FROM work_order_items wci
      JOIN classifications cci ON cci.work_order_item_id = wci.id
      WHERE wci.work_order_id = wo.id AND cci.status = $${params.length}
    )`);
  }
  if (from) {
    params.push(from);
    conditions.push(`wo.created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`wo.created_at < $${params.length}::date + INTERVAL '1 day'`);
  }
  const term = typeof search === 'string' ? search.trim() : '';
  if (term) {
    params.push(`%${term}%`);
    const p = params.length;
    conditions.push(`(wo.wo_number ILIKE $${p} OR wo.title ILIKE $${p} OR wo.customer ILIKE $${p}
       OR u.full_name ILIKE $${p}
       OR EXISTS (
         SELECT 1 FROM work_order_groups gx
         LEFT JOIN machine_model mmx ON mmx.id = gx.machine_model_id
         WHERE gx.work_order_id = wo.id AND mmx.model_code ILIKE $${p}
       ))`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, (page - 1) * limit);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const result = await pool.query(
    /* wo relation with model and version has to be deleted because it would interfere the classification.
     added new relation: to groupWO to get and store ids*/
    `SELECT wo.id, wo.wo_number, wo.title, wo.customer, wo.status,
            wo.revision, wo.created_by, wo.assigned_coder_id, wo.created_at, wo.updated_at,
            u.full_name AS created_by_name,
            COUNT(woi.id)::int AS item_count,
            COALESCE(SUM(COALESCE(ie.total_hours, 0)), 0) AS total_estimated_hours,
            (SELECT COUNT(*)::int
             FROM work_order_items woi2
             JOIN classifications c2 ON c2.work_order_item_id = woi2.id
             WHERE woi2.work_order_id = wo.id AND c2.status = 'CODER_REVIEW'
            ) AS open_count,
            (SELECT COUNT(*)::int
             FROM work_order_items woi2
             JOIN classifications c2 ON c2.work_order_item_id = woi2.id
             WHERE woi2.work_order_id = wo.id AND c2.status IN ('CLASSIFIED', 'NON_FIRMWARE')
            ) AS done_count,
            GREATEST(
              wo.updated_at,
              (SELECT MAX(woi2.updated_at) FROM work_order_items woi2 WHERE woi2.work_order_id = wo.id),
              (SELECT MAX(c2.updated_at)
               FROM classifications c2
               JOIN work_order_items woi2 ON woi2.id = c2.work_order_item_id
               WHERE woi2.work_order_id = wo.id),
              (SELECT MAX(pt.updated_at) FROM production_tasks pt WHERE pt.work_order_id = wo.id)
            ) AS last_activity,
            (SELECT string_agg(g.label, '; ')
             FROM (
               SELECT DISTINCT CONCAT_WS(' ', mm.model_code) AS label
               FROM work_order_groups g
               LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
               WHERE g.work_order_id = wo.id
             ) g
            ) AS group_summary,
            COUNT(*) OVER ()::int AS total
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     ${where}
     GROUP BY wo.id, u.full_name
     ORDER BY wo.created_at DESC, wo.id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`
    , params
  );
  return { items: result.rows, total: result.rows[0] ? result.rows[0].total : 0 };
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT wo.id, wo.wo_number, wo.title, wo.customer, wo.status, wo.notes,
            wo.revision, wo.created_by, wo.assigned_coder_id, wo.created_at, wo.updated_at,
            u.full_name AS created_by_name, assigned.full_name as assigned_coder_name,
COALESCE((SELECT SUM(COALESCE(ie.total_hours, 0))
                       FROM work_order_items woi
                       JOIN item_estimations ie ON ie.work_order_item_id = woi.id
                       WHERE woi.work_order_id = wo.id), 0) AS total_estimated_hours
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     left join users assigned on assigned.id = wo.assigned_coder_id
     WHERE wo.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const findByWoNumber = async (woNumber) => {
  const result = await pool.query(
    `SELECT id, wo_number, status, revision, created_by FROM work_orders WHERE wo_number = $1`,
    [woNumber]
  );
  return result.rows[0] || null;
};

// Shared SELECT for the coder review queue and the PM pending-review view.
const REVIEW_QUEUE_SQL = `
    SELECT woi.id AS item_id, woi.work_order_id, woi.work_order_group_id, woi.item_number, woi.title,
            woi.description, wo.wo_number, wo.title AS work_order_title,
            (SELECT string_agg(DISTINCT mm2.model_code, '; ')
               FROM work_order_groups g2
               LEFT JOIN machine_model mm2 ON mm2.id = g2.machine_model_id
              WHERE g2.work_order_id = woi.work_order_id) AS machine_model_code,
            
            c.classification_reason, c.status, c.created_at, c.reviewed_at, c.reviewed_by,
            c.assist_kb_id, c.assist_kb_code, c.assist_match_score, c.assist_semantic_margin,
            c.assist_complexity_level_id, c.assist_fw_related, c.assist_response,
            c.review_reason, c.assist_blocked_reason,
            kb_s.title AS assist_kb_title,
            kb_s.confidence_score AS assist_kb_confidence_score,
            wo.assigned_coder_id,
            assigned.full_name AS assigned_coder_name,
            reviewer.full_name AS reviewed_by_name,
            COUNT(*) OVER ()::int AS total
     FROM work_order_items woi
     JOIN work_orders wo ON wo.id = woi.work_order_id
     JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN kb_items kb_s ON kb_s.id = c.assist_kb_id
     LEFT JOIN users assigned ON assigned.id = wo.assigned_coder_id
     LEFT JOIN users reviewer ON reviewer.id = c.reviewed_by
`;

const findCoderReviewQueue = async ({ page = 1, limit = 15 } = {}) => {
  const result = await pool.query(
    `${REVIEW_QUEUE_SQL}
     WHERE c.status = 'CODER_REVIEW'
     ORDER BY c.created_at ASC, wo.id, woi.item_number
     LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]
  );
  return { items: result.rows, total: result.rows[0] ? result.rows[0].total : 0 };
};

// PM view: items still waiting for a coder review plus the ones already reviewed.
const findPendingReviewQueue = async ({ page = 1, limit = 15 } = {}) => {
  const result = await pool.query(
    `${REVIEW_QUEUE_SQL}
     WHERE c.status IN ('CODER_REVIEW', 'CLASSIFIED', 'NON_FIRMWARE')
     ORDER BY (c.status = 'CODER_REVIEW') DESC, c.created_at ASC, wo.id, woi.item_number
     LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit]
  );
  return { items: result.rows, total: result.rows[0] ? result.rows[0].total : 0 };
};

const createWithGroups = async ({ wo_number, customer, created_by, groups, items, revision = 0 }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const woResult = await client.query(
      `INSERT INTO work_orders (wo_number, customer, created_by, revision)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [wo_number, customer, created_by, revision]
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
          item_number = `${idx}`;
          idx += 1;
        } while (usedNumbers.includes(item_number));
      }
      usedNumbers.push(item_number);
      const itemResult = await client.query(
        `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, description, quantity)
         VALUES ($1, NULL, $2, $3, $4, $5)
         RETURNING *`,
        [wo.id, item_number, item.title, item.description ?? null, item.quantity || 1]
      );
      createdItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');
    return { ...wo, groups: createdGroups, items: createdItems };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      const { ApiError } = require('../middleware/errorHandler');
      if (err.constraint === 'work_orders_wo_number_key') {
        throw new ApiError(409, 'A work order with this number already exists');
      }
      throw new ApiError(409, 'A group with this model/serial number already exists on the work order');
    }
    throw err;
  } finally {
    client.release();
  }
};

const reviseWithGroups = async ({ id, customer, groups, items, revision }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const locked = await client.query(
      'SELECT id, wo_number, status, revision FROM work_orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (locked.rows.length === 0) {
      const { ApiError } = require('../middleware/errorHandler');
      throw new ApiError(404, 'Work order not found');
    }

    // ponytail: status gate lives under the row lock so two concurrent uploads
    // can't both rewrite a finalized WO. Same WO number always overwrites.
    const current = locked.rows[0];
    if (revision <= Number(current.revision)) {
      const { ApiError } = require('../middleware/errorHandler');
      throw new ApiError(
        409,
        `Uploaded revision ${revision} must be newer than current revision ${current.revision}`,
        [],
        {
          code: 'WO_REVISION_NOT_NEWER',
          uploaded_revision: revision,
          existing_revision: Number(current.revision),
        }
      );
    }
    const LOCKED_WO_STATUSES = ['FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE', 'COMPLETED'];
    if (LOCKED_WO_STATUSES.includes(current.status)) {
      const { ApiError } = require('../middleware/errorHandler');
      throw new ApiError(409, `Work order ${current.wo_number} is ${current.status} and can no longer be revised`);
    }

    const woResult = await client.query(
      `UPDATE work_orders
       SET customer = $2, revision = $3, status = 'DRAFT', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, customer, revision]
    );
    const wo = woResult.rows[0];

    // ponytail: deleting items cascades their classifications/estimations/matches;
    // production tasks are cleared explicitly so the revised WO re-enters at DRAFT clean.
    await client.query('DELETE FROM production_tasks WHERE work_order_id = $1', [id]);
    await client.query('DELETE FROM work_order_items WHERE work_order_id = $1', [id]);
    await client.query('DELETE FROM work_order_groups WHERE work_order_id = $1', [id]);

    const createdGroups = [];
    for (const group of groups || []) {
      const groupResult = await client.query(
        `INSERT INTO work_order_groups (work_order_id, machine_model_id, serial_number)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, group.machine_model_id, group.serial_number || null]
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
          item_number = `${idx}`;
          idx += 1;
        } while (usedNumbers.includes(item_number));
      }
      usedNumbers.push(item_number);
      const itemResult = await client.query(
        `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, description, quantity)
         VALUES ($1, NULL, $2, $3, $4, $5)
         RETURNING *`,
        [id, item_number, item.title, item.description ?? null, item.quantity || 1]
      );
      createdItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');
    return { ...wo, groups: createdGroups, items: createdItems, previous_revision: Number(current.revision) };
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

const update = async (id, { title, customer, status, notes }) => {
  const result = await pool.query(
    `UPDATE work_orders
     SET title = COALESCE($2, title),
         customer = COALESCE($3, customer),
         status = COALESCE($4, status),
         notes = COALESCE($5, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, title, customer, status, notes]
  );
  return result.rows[0] || null;
};
// ---------- Work Order Groups ----------
const findGroupsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT g.id, g.work_order_id, g.machine_model_id,
            g.serial_number, g.created_at, g.updated_at,
            mm.model_code AS machine_model_code, mm.name AS machine_model_name,
            (SELECT COUNT(*)::int FROM work_order_items woi WHERE woi.work_order_group_id = g.id) AS item_count
     FROM work_order_groups g
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
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

const countCoderReviewRemainingByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM work_order_items woi
     JOIN classifications c ON c.work_order_item_id = woi.id
     WHERE woi.work_order_id = $1
       AND c.status = 'CODER_REVIEW'`,
    [workOrderId]
  );
  return result.rows[0]?.cnt || 0;
};

const findClassificationEmailDataByWorkOrderId = async (workOrderId) => {
  const wo = await pool.query(
    `SELECT wo.id, wo.wo_number, wo.created_by, u.email AS created_by_email, u.full_name AS created_by_name
     FROM work_orders wo
     LEFT JOIN users u ON u.id = wo.created_by
     WHERE wo.id = $1`,
    [workOrderId]
  );
  const items = await pool.query(
    `SELECT woi.item_number, woi.title,
            c.fw_related, c.complexity_level_id,
            cl.code AS complexity_code, cl.name AS complexity_name, cl.firmware_name
     FROM work_order_items woi
     JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     WHERE woi.work_order_id = $1
     ORDER BY woi.item_number`,
    [workOrderId]
  );
  return { workOrder: wo.rows[0] || null, items: items.rows };
};

module.exports = {
  findAll,
  findById,
  findByWoNumber,
  findCoderReviewQueue,
  findPendingReviewQueue,
  createWithGroups,
  reviseWithGroups,
  update,
  findGroupsByWorkOrderId,
  findGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  countItemsByGroupId,
  findItemNumbersByGroupId,
  findItemNumbersByWorkOrderId,
  countCoderReviewRemainingByWorkOrderId,
  findClassificationEmailDataByWorkOrderId,
};
