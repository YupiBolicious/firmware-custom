const pool = require('../config/db');

const WORK_QUEUE_SQL = `
    SELECT wo.id, wo.wo_number, COALESCE(wo.title, '') AS title, wo.status, wo.updated_at,
           wo.customer, wo.created_at,
           (SELECT string_agg(g.label, '; ')
            FROM (
              SELECT DISTINCT CONCAT_WS(' ', mm.model_code) AS label
              FROM work_order_groups g
              LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
              WHERE g.work_order_id = wo.id
            ) g
           ) AS group_summary,
           (SELECT COALESCE(jsonb_agg(to_jsonb(jg)), '[]'::jsonb)
            FROM (
              SELECT DISTINCT g.id, g.machine_model_id, g.serial_number, mm.model_code, mm.name AS machine_model_name
              FROM work_order_groups g
              LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
              WHERE g.work_order_id = wo.id
            ) jg
           ) AS groups,
           COUNT(woi.id)::int AS item_count,
           COALESCE(MAX(COALESCE(ie.total_hours, 0)), 0)::numeric AS total_estimated_hours,
           COUNT(DISTINCT woi.id) FILTER (
             WHERE c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
           )::int AS items_classified,
           COUNT(DISTINCT woi.id) FILTER (WHERE c.status = 'CODER_REVIEW')::int AS open_count,
           COUNT(DISTINCT woi.id) FILTER (WHERE c.status IN ('CLASSIFIED', 'NON_FIRMWARE'))::int AS done_count,
           (SELECT cl.code FROM classifications c2
            JOIN complexity_levels cl ON cl.id = c2.complexity_level_id
            WHERE c2.work_order_item_id IN (SELECT woi2.id FROM work_order_items woi2 WHERE woi2.work_order_id = wo.id)
              AND c2.complexity_level_id IS NOT NULL
            GROUP BY cl.code ORDER BY COUNT(*) DESC LIMIT 1) AS complexity_code,
           BOOL_AND(COALESCE(c.fw_related, FALSE)) AS all_fw_related,
           BOOL_OR(c.status = 'CODER_REVIEW') AS has_pending_review,
           BOOL_OR(c.status = 'CODER_REVIEW' AND c.created_at <= NOW() - INTERVAL '120 hours') AS has_overdue,
           ARRAY_AGG(DISTINCT woi.title) FILTER (WHERE woi.title IS NOT NULL) AS item_titles,
           GREATEST(
             wo.updated_at,
             (SELECT MAX(woi2.updated_at) FROM work_order_items woi2 WHERE woi2.work_order_id = wo.id),
             (SELECT MAX(c2.updated_at)
              FROM classifications c2
              JOIN work_order_items woi2 ON woi2.id = c2.work_order_item_id
              WHERE woi2.work_order_id = wo.id),
             (SELECT MAX(pt.updated_at) FROM production_tasks pt WHERE pt.work_order_id = wo.id)
           ) AS last_activity
    FROM work_orders wo
    LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
    LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
    LEFT JOIN classifications c ON c.work_order_item_id = woi.id
    GROUP BY wo.id
`;

// Client-side filters from usePmDashboard, mapped to predicates on the wrapper
const buildFilters = (f) => {
  const parts = [];
  const params = [];
  if (f.search) {
    params.push(`%${f.search.toLowerCase()}%`);
    const p = `$${params.length}`;
    parts.push(`(LOWER(COALESCE(q.wo_number, '')) LIKE ${p}
                OR LOWER(COALESCE(q.title, '')) LIKE ${p}
                OR LOWER(COALESCE(q.customer, '')) LIKE ${p}
                OR LOWER(COALESCE(q.group_summary, '')) LIKE ${p}
                OR EXISTS (SELECT 1 FROM unnest(q.item_titles) t WHERE LOWER(t) LIKE ${p}))`);
  }
  if (f.status) {
    params.push(f.status);
    parts.push(`q.status = $${params.length}`);
  }
  if (f.model) {
    params.push(f.model);
    parts.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(q.groups) g WHERE (g->>'machine_model_id')::int = $${params.length}::int)`);
  }
  if (f.complexity) {
    params.push(f.complexity);
    parts.push(`q.complexity_code = $${params.length}`);
  }
  if (f.fw_related === 'FW') parts.push('q.all_fw_related IS TRUE');
  if (f.fw_related === 'NON_FW') parts.push('q.all_fw_related IS NOT TRUE');
  if (f.date_from) {
    params.push(f.date_from);
    parts.push(`q.created_at >= $${params.length}::date`);
  }
  if (f.date_to) {
    params.push(f.date_to);
    parts.push(`q.created_at <= (($${params.length}::date + INTERVAL '1 day') - INTERVAL '1 microsecond')`);
  }
  return { where: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
};

const findKpis = async (filters) => {
  const { where, params } = buildFilters(filters);
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE q.status = 'ANALYZED')::int AS active_wos,
      COUNT(*) FILTER (WHERE q.has_pending_review)::int AS pending_review,
      COUNT(*) FILTER (WHERE q.status = 'ANALYZED')::int AS in_progress,
      COUNT(*) FILTER (WHERE q.status = 'PRODUCTION')::int AS production,
      COUNT(*) FILTER (WHERE q.status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE q.has_overdue)::int AS overdue,
      COALESCE(MAX(q.total_estimated_hours), 0)::numeric AS total_estimated_hours,
      0::numeric AS queued_hours,
      COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE')), 0)::numeric AS in_progress_hours,
      COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status = 'COMPLETED'), 0)::numeric AS completed_hours
    FROM (${WORK_QUEUE_SQL}) q
    ${where}
  `, params);
  return result.rows[0];
};

const findWorkQueue = async ({ page, limit, filters }) => {
  const { where, params } = buildFilters(filters);
  const [countResult, result] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS total FROM (${WORK_QUEUE_SQL}) q
      ${where}
    `, params),
    pool.query(`
      SELECT *
      FROM (${WORK_QUEUE_SQL}) q
      ${where}
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, (page - 1) * limit]),
  ]);
  return { rows: result.rows, total: countResult.rows[0]?.total ?? 0 };
};

const findStatusDistribution = async (filters) => {
  const { where, params } = buildFilters(filters);
  const result = await pool.query(`
    SELECT q.status, COUNT(*)::int AS count
    FROM (${WORK_QUEUE_SQL}) q
    ${where}
    GROUP BY q.status
    ORDER BY CASE q.status
      WHEN 'ANALYZED' THEN 1
      WHEN 'FINALIZED' THEN 2
      WHEN 'PRODUCTION' THEN 3
      WHEN 'READY_TO_CLOSE' THEN 4
      WHEN 'COMPLETED' THEN 5
      ELSE 6
    END
  `, params);
  return result.rows;
};

const findWeeklyTrend = async (filters = {}, unit = 'week') => {
  const { where, params } = buildFilters(filters);
  const bucket = unit === 'day'
    ? `date_trunc('day', q.updated_at)::date`
    : `(date_trunc('week', q.updated_at + INTERVAL '1 day') - INTERVAL '1 day')::date`;
  const result = await pool.query(`
    SELECT ${bucket} AS week_start,
           0::numeric AS hours_queued,
           COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE')), 0)::numeric AS hours_in_progress,
           COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status = 'COMPLETED'), 0)::numeric AS hours_completed,
           0::int AS items_queued,
           COALESCE(COUNT(*) FILTER (WHERE q.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE')), 0)::int AS items_in_progress,
           COALESCE(COUNT(*) FILTER (WHERE q.status = 'COMPLETED'), 0)::int AS items_completed
    FROM (${WORK_QUEUE_SQL}) q
    ${where}
    GROUP BY 1
    ORDER BY 1
  `, params);
  return result.rows;
};

const findOptions = async (filters) => {
  const models = await pool.query(`
    SELECT DISTINCT g->>'machine_model_id' AS id, g->>'model_code' AS code, g->>'machine_model_name' AS name
    FROM (${WORK_QUEUE_SQL}) q, jsonb_array_elements(q.groups) g
    WHERE g->>'machine_model_id' IS NOT NULL
    ORDER BY g->>'model_code'
  `);
  const complexityParams = filters.model ? [filters.model] : [];
  const complexities = await pool.query(`
    SELECT DISTINCT q.complexity_code AS code
    FROM (${WORK_QUEUE_SQL}) q
    WHERE q.complexity_code IS NOT NULL
      ${filters.model ? `AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.groups) g WHERE (g->>'machine_model_id')::int = $1::int)` : ''}
    ORDER BY q.complexity_code
  `, complexityParams);
  return { models: models.rows, complexities: complexities.rows };
};

module.exports = {
  findKpis,
  findWorkQueue,
  findStatusDistribution,
  findWeeklyTrend,
  findOptions,
};