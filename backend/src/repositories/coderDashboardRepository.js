const pool = require('../config/db');

const findKpis = async (userId) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int
        FROM classifications c
        JOIN work_order_items woi ON woi.id = c.work_order_item_id
        JOIN work_orders wo ON wo.id = woi.work_order_id
        WHERE c.status = 'CODER_REVIEW' AND wo.status != 'FINALIZED'
       ) AS pending_count,
       (SELECT COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric
        FROM classifications c
        JOIN work_order_items woi ON woi.id = c.work_order_item_id
        JOIN work_orders wo ON wo.id = woi.work_order_id
        JOIN item_estimations ie ON ie.work_order_item_id = woi.id
        WHERE c.status = 'CODER_REVIEW' AND wo.status != 'FINALIZED'
       ) AS pending_hours,
       (SELECT COUNT(*)::int
        FROM classifications c
        JOIN work_order_items woi ON woi.id = c.work_order_item_id
        JOIN work_orders wo ON wo.id = woi.work_order_id
        WHERE c.reviewed_by = $1
          AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
       ) AS completed_count,
       (SELECT COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric
        FROM classifications c
        JOIN work_order_items woi ON woi.id = c.work_order_item_id
        JOIN work_orders wo ON wo.id = woi.work_order_id
        JOIN item_estimations ie ON ie.work_order_item_id = woi.id
        WHERE c.reviewed_by = $1
          AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
       ) AS completed_hours,
       (SELECT COUNT(*)::int
        FROM classifications c
        JOIN work_order_items woi ON woi.id = c.work_order_item_id
        JOIN work_orders wo ON wo.id = woi.work_order_id
        WHERE c.status = 'CODER_REVIEW'
          AND wo.status != 'FINALIZED'
          AND c.created_at < NOW() - INTERVAL '48 hours'
       ) AS overdue_count`,
    [userId]
  );
  return result.rows[0];
};

const findReviewQueue = async () => {
  const result = await pool.query(
    `SELECT woi.id AS item_id, woi.work_order_id, woi.work_order_group_id, woi.item_number,
            woi.title, woi.description, woi.quantity,
            wo.wo_number, wo.title AS work_order_title,
            mm.model_code AS machine_model_code, mmv.version_code AS machine_model_version,
            g.serial_number,
            c.classification_reason, c.confidence_score, c.status,
            c.created_at,
            cl.code AS complexity_code, cl.name AS complexity_name,
            COALESCE(ie.total_hours * woi.quantity, 0)::numeric AS estimated_hours
     FROM work_order_items woi
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     JOIN work_orders wo ON wo.id = woi.work_order_id
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
     LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
     JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     WHERE c.status = 'CODER_REVIEW' AND wo.status != 'FINALIZED'
     ORDER BY c.created_at ASC, wo.id, woi.item_number`
  );
  return result.rows;
};

const findWorkQueue = async () => {
  const result = await pool.query(
    `SELECT woi.id AS item_id, woi.work_order_id, woi.work_order_group_id, woi.item_number, woi.title, woi.description,
            woi.quantity, wo.wo_number, wo.title AS work_order_title,
            wo.status AS work_order_status, wo.created_at AS work_order_created_at,
            mm.model_code AS machine_model_code, mmv.version_code AS machine_model_version,
            g.serial_number,
            cl.code AS complexity_code, cl.name AS complexity_name,
            c.status AS classification_status, c.confidence_score,
            c.reviewed_by, c.created_at AS classification_created_at,
            COALESCE(ie.total_hours * woi.quantity, 0)::numeric AS estimated_hours
     FROM work_order_items woi
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     JOIN work_orders wo ON wo.id = woi.work_order_id
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
     LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
     JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     WHERE wo.status != 'FINALIZED'
     ORDER BY wo.id, woi.item_number`
  );
  return result.rows;
};

const countWorkOrderQueue = async ({ search, woStatus } = {}) => {
  const conds = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conds.push(`(wo.wo_number ILIKE $${params.length} OR wo.title ILIKE $${params.length} OR wo.customer ILIKE $${params.length})`);
  }
  if (woStatus && woStatus !== 'ALL') {
    params.push(woStatus);
    conds.push(`wo.status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM work_orders wo ${where}`, params);
  return result.rows[0].count;
};

const findWorkOrderQueue = async ({ page = 1, limit = 10, search, woStatus } = {}) => {
  const conds = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conds.push(`(wo.wo_number ILIKE $${params.length} OR wo.title ILIKE $${params.length} OR wo.customer ILIKE $${params.length})`);
  }
  if (woStatus && woStatus !== 'ALL') {
    params.push(woStatus);
    conds.push(`wo.status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(limit);
  const limitPh = `$${params.length}`;
  params.push((page - 1) * limit);
  const offsetPh = `$${params.length}`;
  const result = await pool.query(
    `SELECT wo.id, wo.wo_number, wo.title, wo.customer, wo.status, wo.updated_at,
            COUNT(woi.id)::int AS item_count,
            COUNT(*) FILTER (WHERE c.status = 'CODER_REVIEW')::int AS open_count,
            COUNT(*) FILTER (WHERE c.status IN ('CLASSIFIED', 'NON_FIRMWARE'))::int AS done_count,
            COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS total_hours,
            MAX(c.updated_at) AS last_activity
     FROM work_orders wo
     LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
     LEFT JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     ${where}
     GROUP BY wo.id
     ORDER BY (COUNT(*) FILTER (WHERE c.status = 'CODER_REVIEW') > 0) DESC,
              COUNT(*) FILTER (WHERE c.status = 'CODER_REVIEW') DESC,
              wo.updated_at DESC
     LIMIT ${limitPh} OFFSET ${offsetPh}`,
    params
  );
  return result.rows;
};

const countCoderActivity = async () => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_trail
     WHERE action IN ('ITEM_REVIEWED', 'ITEM_ADDED')`
  );
  return result.rows[0].count;
};

const findCoderActivity = async (page = 1, limit = 15) => {
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `SELECT at.id, at.action, at.details, at.entity_type, at.entity_id,
             at.created_at,
            u.full_name AS user_name
     FROM audit_trail at
     LEFT JOIN users u ON u.id = at.user_id
     WHERE at.action IN ('ITEM_REVIEWED', 'ITEM_ADDED')
     ORDER BY at.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
};

const countNewWorkOrders = async () => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_trail
     WHERE action = 'WORK_ORDER_CREATED'`
  );
  return result.rows[0].count;
};

const findNewWorkOrders = async (page = 1, limit = 15) => {
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `SELECT at.id, at.action, at.entity_type, at.entity_id,
            at.details, at.created_at,
            u.full_name AS user_name
     FROM audit_trail at
     LEFT JOIN users u ON u.id = at.user_id
     WHERE at.action = 'WORK_ORDER_CREATED'
     ORDER BY at.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
};

const findWeeklyTrend = async (weeks = 8) => {
  const result = await pool.query(
    `WITH weeks AS (
       SELECT generate_series(
         date_trunc('week', NOW() - ($1 || ' weeks')::interval),
         date_trunc('week', NOW()),
         '1 week'::interval
       )::date AS week_start
     )
     SELECT
       w.week_start,
       COALESCE(queued.cnt, 0)::int AS items_queued,
       COALESCE(completed.cnt, 0)::int AS items_completed,
       COALESCE(queued.hrs, 0)::numeric AS hours_queued,
       COALESCE(completed.hrs, 0)::numeric AS hours_completed
     FROM weeks w
     LEFT JOIN (
       SELECT date_trunc('week', c.created_at)::date AS week_start,
              COUNT(*)::int AS cnt,
              COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS hrs
       FROM classifications c
       JOIN work_order_items woi ON woi.id = c.work_order_item_id
       LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
       WHERE c.status = 'CODER_REVIEW'
       GROUP BY date_trunc('week', c.created_at)
     ) queued ON queued.week_start = w.week_start
     LEFT JOIN (
       SELECT date_trunc('week', c.reviewed_at)::date AS week_start,
              COUNT(*)::int AS cnt,
              COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS hrs
       FROM classifications c
       JOIN work_order_items woi ON woi.id = c.work_order_item_id
       LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
       WHERE c.reviewed_at IS NOT NULL
         AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
       GROUP BY date_trunc('week', c.reviewed_at)
     ) completed ON completed.week_start = w.week_start
     ORDER BY w.week_start ASC`,
    [weeks]
  );
  return result.rows;
};

module.exports = {
  findKpis,
  findReviewQueue,
  findWorkQueue,
  findWorkOrderQueue,
  countWorkOrderQueue,
  countCoderActivity,
  findCoderActivity,
  countNewWorkOrders,
  findNewWorkOrders,
  findWeeklyTrend,
};
