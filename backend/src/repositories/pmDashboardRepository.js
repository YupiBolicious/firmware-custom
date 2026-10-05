const pool = require('../config/db');

// Per-work-order aggregation row. All dashboard panels filter against these
// computed columns, so every query below wraps this same macro.
const WORK_QUEUE_SQL = `
    SELECT wo.id, wo.wo_number, COALESCE(wo.title, '') AS title, wo.status, wo.updated_at,
           wo.customer, wo.created_at,
           (SELECT string_agg(g.label, '; ')
            FROM (
              SELECT DISTINCT CONCAT_WS(' ', mm.model_code, mmv.version_code, NULLIF(g.serial_number, '')) AS label
              FROM work_order_groups g
              LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
              LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
              WHERE g.work_order_id = wo.id
            ) g
           ) AS group_summary,
           (SELECT COALESCE(jsonb_agg(to_jsonb(jg)), '[]'::jsonb)
            FROM (
              SELECT DISTINCT g.id, g.machine_model_id, g.machine_model_version_id,
                     g.serial_number, mm.model_code, mm.name AS machine_model_name,
                     mmv.version_code
              FROM work_order_groups g
              LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
              LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
              WHERE g.work_order_id = wo.id
            ) jg
           ) AS groups,
           COUNT(woi.id)::int AS item_count,
           COALESCE(SUM(COALESCE(ie.total_hours, 0) - COALESCE(ie.verification_mh, 0)), 0)::numeric AS total_estimated_hours,
           COUNT(DISTINCT woi.id) FILTER (
             WHERE c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
           )::int AS items_classified,
           (SELECT cl.code FROM classifications c2
            JOIN complexity_levels cl ON cl.id = c2.complexity_level_id
            WHERE c2.work_order_item_id IN (SELECT woi2.id FROM work_order_items woi2 WHERE woi2.work_order_id = wo.id)
              AND c2.complexity_level_id IS NOT NULL
            GROUP BY cl.code ORDER BY COUNT(*) DESC LIMIT 1) AS complexity_code,
           BOOL_AND(COALESCE(c.fw_related, FALSE)) AS all_fw_related,
           BOOL_OR(c.status = 'CODER_REVIEW') AS has_pending_review,
           BOOL_OR(c.status = 'CODER_REVIEW' AND c.created_at < NOW() - INTERVAL '48 hours') AS has_overdue,
           ARRAY_AGG(DISTINCT woi.title) FILTER (WHERE woi.title IS NOT NULL) AS item_titles,
           MAX(GREATEST(wo.updated_at, c.reviewed_at)) AS last_activity
    FROM work_orders wo
    LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
    LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
    LEFT JOIN classifications c ON c.work_order_item_id = woi.id
    GROUP BY wo.id
`;

// Client-side filters from usePmDashboard, mapped to predicates on the wrapper
// columns. Every column it touches (complexity_code, groups, item_titles,
// group_summary, ...) exists in WORK_QUEUE_SQL output.
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
  if (f.version) {
    params.push(f.version);
    parts.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(q.groups) g WHERE (g->>'machine_model_version_id')::int = $${params.length}::int)`);
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
      COUNT(*) FILTER (WHERE q.status IN ('DRAFT', 'ANALYZED'))::int AS active_wos,
      COUNT(*) FILTER (WHERE q.has_pending_review)::int AS pending_review,
      COUNT(*) FILTER (WHERE q.status = 'ANALYZED')::int AS in_progress,
      COUNT(*) FILTER (WHERE q.status = 'PRODUCTION')::int AS production,
      COUNT(*) FILTER (WHERE q.status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE q.has_overdue)::int AS overdue,
      COALESCE(SUM(q.total_estimated_hours), 0)::numeric AS total_estimated_hours,
      COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status = 'DRAFT'), 0)::numeric AS queued_hours,
      COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION')), 0)::numeric AS in_progress_hours,
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

const findAttentionItems = async (filters) => {
  const { where, params } = buildFilters(filters);
  const result = await pool.query(`
    SELECT * FROM (
      -- 1. Blocked: awaiting coder review for more than 48 hours
      SELECT wo.id AS work_order_id, wo.wo_number, COALESCE(wo.title, '') AS title,
             'blocked_48h' AS kind, 'danger' AS priority,
             'Waiting >48h for coder review' AS message,
             EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600 AS age_hours
      FROM classifications c
      JOIN work_order_items woi ON woi.id = c.work_order_item_id
      JOIN work_orders wo ON wo.id = woi.work_order_id
      WHERE c.status = 'CODER_REVIEW'
        AND c.created_at < NOW() - INTERVAL '48 hours'
        AND c.reviewed_by IS NOT NULL
        AND wo.status NOT IN ('FINALIZED', 'COMPLETED')
      UNION ALL
      -- 2. Coder review pending (24-48h window, not yet blocked)
      SELECT wo.id, wo.wo_number, COALESCE(wo.title, '') AS title,
             'coder_review' AS kind, 'warning' AS priority,
             'Waiting for coder review' AS message,
             EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600 AS age_hours
      FROM classifications c
      JOIN work_order_items woi ON woi.id = c.work_order_item_id
      JOIN work_orders wo ON wo.id = woi.work_order_id
      WHERE c.status = 'CODER_REVIEW'
        AND c.created_at >= NOW() - INTERVAL '48 hours'
        AND c.reviewed_by IS NOT NULL
        AND wo.status NOT IN ('FINALIZED', 'COMPLETED')
      UNION ALL
      -- 3. Review item with no coder assigned
      SELECT wo.id, wo.wo_number, COALESCE(wo.title, '') AS title,
             'unassigned_review' AS kind, 'info' AS priority,
             'Review item unassigned to a coder' AS message,
             EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600 AS age_hours
      FROM classifications c
      JOIN work_order_items woi ON woi.id = c.work_order_item_id
      JOIN work_orders wo ON wo.id = woi.work_order_id
      WHERE c.status = 'CODER_REVIEW'
        AND c.reviewed_by IS NULL
        AND wo.status NOT IN ('FINALIZED', 'COMPLETED')
      UNION ALL
      -- 4. Unclassified items in an active work order
      SELECT wo.id, wo.wo_number, COALESCE(wo.title, '') AS title,
             'unclassified' AS kind, 'warning' AS priority,
             COUNT(DISTINCT woi.id)::text || ' unclassified item present' AS message,
             NULL::numeric AS age_hours
      FROM work_orders wo
      JOIN work_order_items woi ON woi.work_order_id = wo.id
      JOIN classifications c ON c.work_order_item_id = woi.id
      WHERE c.status = 'PENDING'
        AND wo.status NOT IN ('FINALIZED', 'COMPLETED')
      GROUP BY wo.id, wo.wo_number, COALESCE(wo.title, '')
      UNION ALL
      -- 5. Stale: no progress for 7+ days while still active
      SELECT wo.id, wo.wo_number, COALESCE(wo.title, '') AS title,
             'stale' AS kind, 'warning' AS priority,
             'No progress in 7+ days' AS message,
             EXTRACT(EPOCH FROM (NOW() - GREATEST(COALESCE(wo.updated_at, '2000-01-01'),
                     COALESCE(MAX(c.reviewed_at), '2000-01-01')))) / 3600 AS age_hours
      FROM work_orders wo
      LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
      LEFT JOIN classifications c ON c.work_order_item_id = woi.id
      WHERE wo.status IN ('DRAFT', 'ANALYZED', 'PRODUCTION')
      GROUP BY wo.id, wo.wo_number, COALESCE(wo.title, ''), wo.updated_at
      HAVING GREATEST(COALESCE(wo.updated_at, '2000-01-01'),
                      COALESCE(MAX(c.reviewed_at), '2000-01-01')) < NOW() - INTERVAL '7 days'
    ) alerts
    WHERE alerts.work_order_id IN (SELECT q.id FROM (${WORK_QUEUE_SQL}) q ${where})
    ORDER BY
      CASE priority WHEN 'danger' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      COALESCE(age_hours, 0) DESC
  `, params);
  return result.rows;
};

const findStatusDistribution = async (filters) => {
  const { where, params } = buildFilters(filters);
  const result = await pool.query(`
    SELECT q.status, COUNT(*)::int AS count
    FROM (${WORK_QUEUE_SQL}) q
    ${where}
    GROUP BY q.status
    ORDER BY CASE q.status
      WHEN 'DRAFT' THEN 1
      WHEN 'ANALYZED' THEN 2
      WHEN 'FINALIZED' THEN 3
      WHEN 'PRODUCTION' THEN 4
      WHEN 'COMPLETED' THEN 5
      ELSE 6
    END
  `, params);
  return result.rows;
};

const findWeeklyTrend = async (filters = {}, unit = 'week') => {
  const { where, params } = buildFilters(filters);
  const bucket = unit === 'day'
    ? `date_trunc('day', CASE WHEN q.status = 'DRAFT' THEN q.created_at ELSE q.updated_at END)::date`
    : `(date_trunc('week', CASE WHEN q.status = 'DRAFT' THEN q.created_at ELSE q.updated_at END + INTERVAL '1 day') - INTERVAL '1 day')::date`;
  const result = await pool.query(`
    SELECT ${bucket} AS week_start,
           COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status = 'DRAFT'), 0)::numeric AS hours_queued,
           COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION')), 0)::numeric AS hours_in_progress,
           COALESCE(SUM(q.total_estimated_hours) FILTER (WHERE q.status = 'COMPLETED'), 0)::numeric AS hours_completed,
           COALESCE(COUNT(*) FILTER (WHERE q.status = 'DRAFT'), 0)::int AS items_queued,
           COALESCE(COUNT(*) FILTER (WHERE q.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION')), 0)::int AS items_in_progress,
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
  const versionParams = filters.model ? [filters.model] : [];
  const versions = await pool.query(`
    SELECT DISTINCT g->>'machine_model_version_id' AS id, g->>'version_code' AS code, g->>'machine_model_id' AS model_id
    FROM (${WORK_QUEUE_SQL}) q, jsonb_array_elements(q.groups) g
    WHERE g->>'machine_model_version_id' IS NOT NULL
      ${filters.model ? "AND (g->>'machine_model_id')::int = $1::int" : ''}
    ORDER BY g->>'version_code', g->>'machine_model_id'
  `, versionParams);
  const complexityParams = filters.model ? [filters.model] : [];
  const complexities = await pool.query(`
    SELECT DISTINCT q.complexity_code AS code
    FROM (${WORK_QUEUE_SQL}) q
    WHERE q.complexity_code IS NOT NULL
      ${filters.model ? `AND EXISTS (SELECT 1 FROM jsonb_array_elements(q.groups) g WHERE (g->>'machine_model_id')::int = $1::int)` : ''}
    ORDER BY q.complexity_code
  `, complexityParams);
  return { models: models.rows, versions: versions.rows, complexities: complexities.rows };
};

module.exports = {
  findKpis,
  findWorkQueue,
  findAttentionItems,
  findStatusDistribution,
  findWeeklyTrend,
  findOptions,
};