const pool = require('../config/db');

// Per-work-order aggregation row. All dashboard panels filter against these
// computed columns, so every query below wraps this same macro.
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
           COALESCE(SUM(COALESCE(ie.total_hours, 0)), 0)::numeric AS total_estimated_hours,
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
           BOOL_OR(c.status = 'CODER_REVIEW' AND c.created_at <= NOW() - INTERVAL '48 hours') AS has_overdue,
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
    WITH filtered_work_orders AS (
      SELECT q.id, q.wo_number, q.title, q.status
      FROM (${WORK_QUEUE_SQL}) q
      ${where}
    ), item_summary AS (
      SELECT woi.work_order_id,
             COUNT(*)::int AS item_count,
             COUNT(*) FILTER (WHERE c.status = 'CODER_REVIEW')::int AS review_count,
             COUNT(*) FILTER (WHERE c.id IS NULL OR c.status = 'PENDING')::int AS pending_count,
             COUNT(*) FILTER (
               WHERE c.id IS NULL OR c.status NOT IN ('CLASSIFIED', 'NON_FIRMWARE') OR c.fw_related IS NULL
             )::int AS unresolved_count,
             MIN(c.created_at) FILTER (WHERE c.status = 'CODER_REVIEW') AS oldest_review_at,
             (ARRAY_AGG(woi.item_number ORDER BY c.created_at, woi.item_number)
               FILTER (WHERE c.status = 'CODER_REVIEW'))[1] AS review_sample_item,
             (ARRAY_AGG(woi.title ORDER BY c.created_at, woi.item_number)
               FILTER (WHERE c.status = 'CODER_REVIEW'))[1] AS review_sample_title,
             (ARRAY_AGG(woi.item_number ORDER BY woi.item_number)
               FILTER (WHERE c.id IS NULL OR c.status = 'PENDING'))[1] AS pending_sample_item
      FROM work_order_items woi
      LEFT JOIN classifications c ON c.work_order_item_id = woi.id
      GROUP BY woi.work_order_id
    ), production_summary AS (
      SELECT pt.work_order_id,
             COUNT(*) FILTER (WHERE NOT pt.completed)::int AS open_task_count,
             MIN(pt.created_at) FILTER (WHERE NOT pt.completed) AS oldest_open_task_at
      FROM production_tasks pt
      GROUP BY pt.work_order_id
    ), activity AS (
      SELECT wo.id AS work_order_id,
             GREATEST(
               wo.updated_at,
               (SELECT MAX(woi.updated_at) FROM work_order_items woi WHERE woi.work_order_id = wo.id),
               (SELECT MAX(c.updated_at)
                FROM classifications c
                JOIN work_order_items woi ON woi.id = c.work_order_item_id
                WHERE woi.work_order_id = wo.id),
               (SELECT MAX(pt.updated_at) FROM production_tasks pt WHERE pt.work_order_id = wo.id)
             ) AS last_activity_at
      FROM work_orders wo
      JOIN filtered_work_orders fwo ON fwo.id = wo.id
    ), action_alerts AS (
      SELECT fwo.id AS work_order_id, fwo.wo_number, fwo.title,
             'coder_review' AS kind,
             CASE WHEN EXTRACT(EPOCH FROM (NOW() - s.oldest_review_at)) >= 48 * 3600 THEN 'danger'
                  WHEN EXTRACT(EPOCH FROM (NOW() - s.oldest_review_at)) >= 24 * 3600 THEN 'warning'
                  ELSE 'info' END AS priority,
             s.review_count AS affected_count,
             EXTRACT(EPOCH FROM (NOW() - s.oldest_review_at)) / 3600 AS age_hours,
             s.review_sample_item AS sample_item,
             COALESCE(s.review_sample_title, '') AS sample_title,
             s.review_count::text || ' item' || CASE WHEN s.review_count = 1 THEN '' ELSE 's' END || ' waiting for coder review' AS message,
             'Open the work order and complete the pending coder review.' AS next_action
      FROM filtered_work_orders fwo
      JOIN item_summary s ON s.work_order_id = fwo.id
      WHERE fwo.status NOT IN ('FINALIZED', 'COMPLETED') AND s.review_count > 0

      UNION ALL

      SELECT fwo.id, fwo.wo_number, fwo.title,
             'analysis_needed', 'info', s.item_count,
              NULL::numeric,
             NULL::varchar, NULL::varchar,
             s.item_count::text || ' item' || CASE WHEN s.item_count = 1 THEN '' ELSE 's' END || ' waiting for analysis',
             'Run Estimate to classify the work-order items.'
      FROM filtered_work_orders fwo
      JOIN item_summary s ON s.work_order_id = fwo.id
      WHERE fwo.status = 'DRAFT' AND s.item_count > 0

      UNION ALL

      SELECT fwo.id, fwo.wo_number, fwo.title,
             'classification_pending', 'warning', s.pending_count,
             NULL::numeric, s.pending_sample_item, NULL::varchar,
             s.pending_count::text || ' item' || CASE WHEN s.pending_count = 1 THEN '' ELSE 's' END || ' still need classification',
             'Re-run analysis or resolve the pending classification.'
      FROM filtered_work_orders fwo
      JOIN item_summary s ON s.work_order_id = fwo.id
      WHERE fwo.status = 'ANALYZED' AND s.pending_count > 0

      UNION ALL

      SELECT fwo.id, fwo.wo_number, fwo.title,
             'ready_to_finalize', 'info', s.item_count,
             NULL::numeric, NULL::varchar, NULL::varchar,
             'All ' || s.item_count::text || ' item' || CASE WHEN s.item_count = 1 THEN '' ELSE 's are' END || ' classified and ready',
             'Review the estimate and finalize the work order.'
      FROM filtered_work_orders fwo
      JOIN item_summary s ON s.work_order_id = fwo.id
      WHERE fwo.status = 'ANALYZED' AND s.item_count > 0 AND s.unresolved_count = 0

      UNION ALL

      SELECT fwo.id, fwo.wo_number, fwo.title,
             'production_followup', 'warning', ps.open_task_count,
             EXTRACT(EPOCH FROM (NOW() - ps.oldest_open_task_at)) / 3600,
             NULL::varchar, NULL::varchar,
             ps.open_task_count::text || ' production task' || CASE WHEN ps.open_task_count = 1 THEN '' ELSE 's are' END || ' still open',
             'Update production task progress on the work order.'
      FROM filtered_work_orders fwo
      JOIN production_summary ps ON ps.work_order_id = fwo.id
      WHERE fwo.status = 'PRODUCTION' AND ps.open_task_count > 0

    ), alerts AS (
      SELECT * FROM action_alerts
      UNION ALL
      SELECT fwo.id, fwo.wo_number, fwo.title,
             'stale', 'warning', 1,
             EXTRACT(EPOCH FROM (NOW() - a.last_activity_at)) / 3600,
             NULL::varchar, NULL::varchar,
             'No work-order progress for 7+ days',
             'Review the work order and confirm its next step.'
      FROM filtered_work_orders fwo
      JOIN activity a ON a.work_order_id = fwo.id
      WHERE fwo.status IN ('DRAFT', 'ANALYZED', 'PRODUCTION')
        AND a.last_activity_at < NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM action_alerts existing
          WHERE existing.work_order_id = fwo.id
            AND existing.kind IN ('coder_review', 'analysis_needed', 'classification_pending', 'ready_to_finalize', 'production_followup')
        )
    )
    SELECT * FROM alerts
    ORDER BY
      CASE priority WHEN 'danger' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      COALESCE(age_hours, 0) DESC,
      work_order_id,
      kind
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
  findAttentionItems,
  findStatusDistribution,
  findWeeklyTrend,
  findOptions,
};