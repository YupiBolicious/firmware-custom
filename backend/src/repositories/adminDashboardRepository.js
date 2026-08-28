const pool = require('../config/db');

const findKpis = async () => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS total_users,
      (SELECT COUNT(*)::int FROM users WHERE is_active) AS active_users,
      (SELECT COUNT(*)::int FROM work_orders) AS total_work_orders,
      (SELECT COUNT(*)::int FROM work_order_items) AS total_custom_items,
      (SELECT COUNT(*)::int FROM classifications WHERE fw_related) AS fw_related_items,
      (SELECT COUNT(*)::int FROM classifications WHERE status = 'CODER_REVIEW') AS pending_coder_reviews,
      (SELECT COUNT(*)::int FROM kb_items) AS kb_entries,
      (SELECT COUNT(*)::int FROM classification_rules) AS classification_rules
  `);
  return result.rows[0];
};

const findHealth = async () => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM classification_rules WHERE is_active) AS active_rules,
      (SELECT COUNT(*)::int FROM confidence_thresholds WHERE is_active) AS active_thresholds,
      (SELECT COUNT(*)::int FROM kb_items WHERE is_active) AS active_kb_items
  `);
  return result.rows[0];
};

const findUserRoleOverview = async () => {
  const result = await pool.query(`
    SELECT r.code, COUNT(DISTINCT u.id)::int AS count
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.is_active
    GROUP BY r.code
  `);
  return result.rows;
};

const findInactiveUsers = async () => {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE NOT is_active
  `);
  return result.rows[0];
};

const findClassificationOverview = async () => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM kb_items) AS total_kb_entries,
      (SELECT COUNT(*)::int FROM classifications
       WHERE reviewed_by IS NOT NULL AND status IN ('CLASSIFIED', 'NON_FIRMWARE')) AS coder_confirmed,
      (SELECT COUNT(*)::int FROM classifications
       WHERE confidence_score >= (SELECT high_confidence_min FROM confidence_thresholds WHERE is_active LIMIT 1)) AS high_confidence,
      (SELECT COUNT(*)::int FROM classifications
       WHERE status = 'CODER_REVIEW'
          OR confidence_score < (SELECT low_confidence_max FROM confidence_thresholds WHERE is_active LIMIT 1)) AS review_cases,
      (SELECT COUNT(*)::int FROM classifications
       WHERE status IN ('CLASSIFIED', 'NON_FIRMWARE')) AS resolved_total
  `);
  return result.rows[0];
};

const findConfigurationCounts = async () => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM complexity_levels) AS complexity_levels,
      (SELECT COUNT(*)::int FROM classification_rules) AS classification_rules,
      (SELECT COUNT(*)::int FROM confidence_thresholds) AS confidence_thresholds,
      (SELECT COUNT(*)::int FROM fw_modules) AS fw_modules,
      (SELECT COUNT(*)::int FROM machine_model) AS machine_models,
      (SELECT COUNT(*)::int FROM machine_model_ver) AS machine_model_versions
  `);
  return result.rows[0];
};

const findActivityTrend = async (from, to, granularity) => {
  const result = await pool.query(`
    WITH bounds AS (
      SELECT
        CASE $3
          WHEN 'day' THEN date_trunc('day', $1::timestamptz)
          WHEN 'month' THEN date_trunc('month', $1::timestamptz)
          ELSE date_trunc('week', $1::timestamptz)
        END AS start_ts,
        CASE $3
          WHEN 'day' THEN date_trunc('day', $2::timestamptz)
          WHEN 'month' THEN date_trunc('month', $2::timestamptz) + INTERVAL '1 month' - INTERVAL '1 day'
          ELSE date_trunc('week', $2::timestamptz) + INTERVAL '6 days'
        END AS end_ts,
        $3::text AS gran
    ),
    buckets AS (
      SELECT generate_series(
        start_ts,
        end_ts,
        CASE gran
          WHEN 'day' THEN INTERVAL '1 day'
          WHEN 'month' THEN INTERVAL '1 month'
          ELSE INTERVAL '1 week'
        END
      ) AS bucket_date
      FROM bounds
    )
    SELECT
      to_char(b.bucket_date, 'YYYY-MM-DD') AS date,
      COALESCE(wo.cnt, 0)::int AS work_orders,
      COALESCE(kb.cnt, 0)::int AS kb_added,
      COALESCE(cl.cnt, 0)::int AS items_classified,
      COALESCE(cr.cnt, 0)::int AS coder_resolved
    FROM buckets b
    LEFT JOIN (
      SELECT date_trunc($3, created_at) AS bucket_date, COUNT(*)::int AS cnt
      FROM work_orders
      WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz + INTERVAL '1 day'
      GROUP BY 1
    ) wo ON wo.bucket_date = b.bucket_date
    LEFT JOIN (
      SELECT date_trunc($3, created_at) AS bucket_date, COUNT(*)::int AS cnt
      FROM kb_items
      WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz + INTERVAL '1 day'
      GROUP BY 1
    ) kb ON kb.bucket_date = b.bucket_date
    LEFT JOIN (
      SELECT date_trunc($3, created_at) AS bucket_date, COUNT(*)::int AS cnt
      FROM classifications
      WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz + INTERVAL '1 day'
        AND status IN ('CLASSIFIED', 'NON_FIRMWARE')
      GROUP BY 1
    ) cl ON cl.bucket_date = b.bucket_date
    LEFT JOIN (
      SELECT date_trunc($3, reviewed_at) AS bucket_date, COUNT(*)::int AS cnt
      FROM classifications
      WHERE reviewed_at >= $1::timestamptz AND reviewed_at < $2::timestamptz + INTERVAL '1 day'
        AND reviewed_at IS NOT NULL
        AND status IN ('CLASSIFIED', 'NON_FIRMWARE')
      GROUP BY 1
    ) cr ON cr.bucket_date = b.bucket_date
    ORDER BY b.bucket_date
  `, [from, to, granularity]);
  return result.rows;
};

module.exports = {
  findKpis,
  findHealth,
  findUserRoleOverview,
  findInactiveUsers,
  findClassificationOverview,
  findConfigurationCounts,
  findActivityTrend,
};