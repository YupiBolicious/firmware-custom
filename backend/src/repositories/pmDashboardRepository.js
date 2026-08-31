const pool = require('../config/db');

const findKpis = async () => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM work_orders WHERE status IN ('DRAFT', 'ANALYZED')) AS active_wos,
      (SELECT COUNT(*)::int FROM classifications WHERE status = 'CODER_REVIEW') AS pending_review,
      (SELECT COUNT(*)::int FROM work_orders WHERE status = 'ANALYZED') AS in_progress,
      (SELECT COUNT(*)::int FROM work_orders WHERE status IN ('PRODUCTION', 'COMPLETED')) AS completed,
      (SELECT COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric
       FROM item_estimations ie
       JOIN work_order_items woi ON woi.id = ie.work_order_item_id) AS total_estimated_hours,
      (SELECT COUNT(*)::int FROM classifications
       WHERE status = 'CODER_REVIEW'
         AND created_at < NOW() - INTERVAL '48 hours') AS overdue
  `);
  return result.rows[0];
};

const findWorkQueue = async () => {
  const result = await pool.query(`
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
           COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS total_estimated_hours,
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
    ORDER BY wo.created_at DESC
  `);
  return result.rows;
};

const findAttentionItems = async () => {
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
             COUNT(DISTINCT woi.id)::text || ' unclassified item(s) present' AS message,
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
    ORDER BY
      CASE priority WHEN 'danger' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      COALESCE(age_hours, 0) DESC
  `);
  return result.rows;
};

const findStatusDistribution = async () => {
  const result = await pool.query(`
    SELECT status, COUNT(*)::int AS count
    FROM work_orders
    GROUP BY status
    ORDER BY CASE status
      WHEN 'DRAFT' THEN 1
      WHEN 'ANALYZED' THEN 2
      WHEN 'FINALIZED' THEN 3
      WHEN 'PRODUCTION' THEN 4
      WHEN 'COMPLETED' THEN 5
    END
  `);
  return result.rows;
};

const findWorkloadByStatus = async () => {
  const result = await pool.query(`
    SELECT wo.status,
           COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS total_hours,
           COUNT(DISTINCT wo.id)::int AS wo_count
    FROM work_orders wo
    LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
    LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
    GROUP BY wo.status
  `);
  return result.rows;
};

const findWeeklyTrend = async (weeks = 8) => {
  const result = await pool.query(`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', NOW() - ($1 || ' weeks')::interval),
        date_trunc('week', NOW()),
        '1 week'::interval
      )::date AS week_start
    )
    SELECT
      w.week_start,
      COALESCE(queued.hrs, 0)::numeric AS hours_queued,
      COALESCE(in_progress.hrs, 0)::numeric AS hours_in_progress,
      COALESCE(completed.hrs, 0)::numeric AS hours_completed,
      COALESCE(queued.cnt, 0)::int AS items_queued,
      COALESCE(in_progress.cnt, 0)::int AS items_in_progress,
      COALESCE(completed.cnt, 0)::int AS items_completed
    FROM weeks w
    LEFT JOIN (
      SELECT date_trunc('week', wo.created_at)::date AS week_start,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS hrs
      FROM work_orders wo
      JOIN work_order_items woi ON woi.work_order_id = wo.id
      JOIN item_estimations ie ON ie.work_order_item_id = woi.id
      WHERE wo.status = 'DRAFT'
      GROUP BY week_start
    ) queued ON queued.week_start = w.week_start
    LEFT JOIN (
      SELECT date_trunc('week', wo.updated_at)::date AS week_start,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS hrs
      FROM work_orders wo
      JOIN work_order_items woi ON woi.work_order_id = wo.id
      JOIN item_estimations ie ON ie.work_order_item_id = woi.id
      WHERE wo.status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION')
      GROUP BY week_start
    ) in_progress ON in_progress.week_start = w.week_start
    LEFT JOIN (
      SELECT date_trunc('week', wo.updated_at)::date AS week_start,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(ie.total_hours * woi.quantity), 0)::numeric AS hrs
      FROM work_orders wo
      JOIN work_order_items woi ON woi.work_order_id = wo.id
      JOIN item_estimations ie ON ie.work_order_item_id = woi.id
      WHERE wo.status = 'COMPLETED'
      GROUP BY week_start
    ) completed ON completed.week_start = w.week_start
    ORDER BY w.week_start ASC
  `, [weeks]);
  return result.rows;
};

module.exports = {
  findKpis,
  findWorkQueue,
  findAttentionItems,
  findStatusDistribution,
  findWorkloadByStatus,
  findWeeklyTrend,
};
