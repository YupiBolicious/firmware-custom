const pool = require('../config/db');

// Per-item estimated hours = item_estimations.total_hours (Complexity Level Hours + verification_mh).
// quantity/model count never factor in; verification is part of the official figure, not informational.
const HOURS_EXPR = 'COALESCE(ie.total_hours, 0)';

// Quarter buckets over [from, to] inclusive (to semantics: created_at < to + 1 day).
// Buckets that have no work orders still appear, zero-filled. Statuses are the
// CURRENT stored values — historical status is never reconstructed from updated_at.
const findQuarterlyReport = async (from, to) => {
  const result = await pool.query(`
    WITH bounds AS (
      SELECT
        date_trunc('quarter', $1::date) AS start_ts,
        date_trunc('quarter', $2::date) AS end_ts
    ),
    buckets AS (
      SELECT generate_series(start_ts, end_ts, INTERVAL '3 months') AS bucket_ts FROM bounds
    ),
    data AS (
      SELECT
        date_trunc('quarter', wo.created_at) AS bucket_ts,
        wo.id AS wo_id,
        wo.status,
        woi.id AS item_id,
        ${HOURS_EXPR} AS est_h
      FROM work_orders wo
      LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
      LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
      WHERE wo.created_at >= $1::date AND wo.created_at < $2::date + INTERVAL '1 day'
    ),
    reviews AS (
      SELECT
        date_trunc('quarter', c.reviewed_at) AS bucket_ts,
        COUNT(*)::int AS cnt_reviews
      FROM classifications c
      WHERE c.reviewed_by IS NOT NULL
        AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')
        AND c.reviewed_at >= $1::date AND c.reviewed_at < $2::date + INTERVAL '1 day'
      GROUP BY 1
    )
    SELECT
      to_char(b.bucket_ts, 'YYYY-MM-DD') AS quarter_start,
      COALESCE(d.cnt_wo, 0)::int AS work_orders,
      COALESCE(d.cnt_items, 0)::int AS custom_items,
      COALESCE(d.hours_queued, 0)::numeric AS hours_queued,
      COALESCE(d.hours_in_progress, 0)::numeric AS hours_in_progress,
      COALESCE(d.hours_completed, 0)::numeric AS hours_completed,
      COALESCE(d.hours_total, 0)::numeric AS hours_total,
      COALESCE(r.cnt_reviews, 0)::int AS coder_reviews
    FROM buckets b
    LEFT JOIN (
      SELECT
        bucket_ts,
        COUNT(DISTINCT wo_id)::int AS cnt_wo,
        COUNT(item_id)::int AS cnt_items,
        COALESCE(SUM(est_h) FILTER (WHERE status = 'DRAFT'), 0)::numeric AS hours_queued,
        COALESCE(SUM(est_h) FILTER (WHERE status IN ('ANALYZED', 'FINALIZED', 'PRODUCTION')), 0)::numeric AS hours_in_progress,
        COALESCE(SUM(est_h) FILTER (WHERE status = 'COMPLETED'), 0)::numeric AS hours_completed,
        COALESCE(SUM(est_h), 0)::numeric AS hours_total
      FROM data
      GROUP BY bucket_ts
    ) d ON d.bucket_ts = b.bucket_ts
    LEFT JOIN reviews r ON r.bucket_ts = b.bucket_ts
    ORDER BY b.bucket_ts
  `, [from, to]);
  return result.rows;
};

module.exports = { findQuarterlyReport };