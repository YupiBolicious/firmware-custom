const pool = require('../config/db');

// Fetch all active KB items for matching
const findAllKbItems = async () => {
  const result = await pool.query(
    `SELECT id, kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score,
            machine_model_id, machine_model_version_id
     FROM kb_items
     WHERE is_active = TRUE`
  );
  return result.rows;
};

// Fetch all active classification rules, ordered by priority
const findAllRules = async () => {
  const result = await pool.query(
    `SELECT id, rule_code, keyword_pattern, fw_related, complexity_level_id, confidence_score, priority
     FROM classification_rules
     WHERE is_active = TRUE
     ORDER BY priority ASC`
  );
  return result.rows;
};

// Fetch confidence thresholds
const findConfidenceThresholds = async () => {
  const result = await pool.query(
    `SELECT threshold_code, high_confidence_min, low_confidence_max
     FROM confidence_thresholds
     WHERE is_active = TRUE`
  );
  return result.rows[0] || null;
};

const ASSIST_COLS = [
  'assist_kb_id',
  'assist_kb_code',
  'assist_match_score',
  'assist_semantic_margin',
  'assist_complexity_level_id',
  'assist_fw_related',
];

// Upsert a classification for an item. `preserveAssist` keeps any existing
// assist snapshot on input-hash-reuse (no new analysis happened), so a pending
// review suggestion — and its structured why-review reason — is never wiped by
// an idempotent re-run.
const upsertClassification = async ({
  work_order_item_id,
  fw_related,
  complexity_level_id,
  classification_method,
  confidence_score,
  classification_reason,
  status,
  input_hash,
  kb_version,
  assist = null,
  preserveAssist = false,
  review_reason = null,
  assist_blocked_reason = null,
}) => {
  const cols = ['work_order_item_id', 'fw_related', 'complexity_level_id', 'classification_method',
    'confidence_score', 'classification_reason', 'status', 'input_hash', 'kb_version',
    'review_reason', 'assist_blocked_reason'];
  const vals = [
    work_order_item_id,
    fw_related,
    complexity_level_id,
    classification_method,
    confidence_score,
    classification_reason,
    status,
    input_hash || null,
    kb_version == null ? null : kb_version,
    review_reason || null,
    assist_blocked_reason || null,
  ];
  if (assist) {
    cols.push(...ASSIST_COLS);
    vals.push(
      assist.kb_item_id != null ? assist.kb_item_id : null,
      assist.kb_code != null ? assist.kb_code : null,
      assist.match_score != null ? assist.match_score : null,
      assist.semantic_margin != null ? assist.semantic_margin : null,
      assist.complexity_level_id != null ? assist.complexity_level_id : null,
      assist.fw_related != null ? assist.fw_related : null
    );
  }
  const baseSet = `fw_related = EXCLUDED.fw_related,
    complexity_level_id = EXCLUDED.complexity_level_id,
    classification_method = EXCLUDED.classification_method,
    confidence_score = EXCLUDED.confidence_score,
    classification_reason = EXCLUDED.classification_reason,
    status = EXCLUDED.status,
    input_hash = EXCLUDED.input_hash,
    kb_version = EXCLUDED.kb_version,
    updated_at = NOW()`;
  const assistSet = ASSIST_COLS.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  // Like ASSIST_COLS, review_reason/assist_blocked_reason are only rewritten on
  // a fresh analysis; the preserve branch keeps the previous snapshot intact.
  const reasonSet = 'review_reason = EXCLUDED.review_reason, assist_blocked_reason = EXCLUDED.assist_blocked_reason';
  const updates = [baseSet];
  if (assist) updates.push(assistSet);
  if (!preserveAssist) updates.push(reasonSet);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `INSERT INTO classifications (${cols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT (work_order_item_id)
     DO UPDATE SET ${updates.join(', ')}
     RETURNING *`,
    vals
  );
  return result.rows[0];
};

// Record a classification match (for traceability)
const createMatch = async ({ classification_id, kb_item_id, rule_id, match_type, match_score }) => {
  const result = await pool.query(
    `INSERT INTO classification_matches (classification_id, kb_item_id, rule_id, match_type, match_score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (classification_id, COALESCE(kb_item_id, 0), COALESCE(rule_id, 0)) DO NOTHING
     RETURNING *`,
    [classification_id, kb_item_id, rule_id, match_type, match_score]
  );
  return result.rows[0];
};

const findByItemId = async (itemId) => {
  const result = await pool.query(
    `SELECT * FROM classifications WHERE work_order_item_id = $1`,
    [itemId]
  );
  return result.rows[0] || null;
};

const deleteMatchesByClassificationId = async (classificationId) => {
  await pool.query(`DELETE FROM classification_matches WHERE classification_id = $1`, [classificationId]);
};

// Best-performing KB match for a classification (lexical provenance traceability).
const findTopMatch = async (classificationId) => {
  const result = await pool.query(
    `SELECT kb_item_id
     FROM classification_matches
     WHERE classification_id = $1 AND kb_item_id IS NOT NULL
     ORDER BY COALESCE(match_score, 0) DESC
     LIMIT 1`,
    [classificationId]
  );
  return result.rows[0] ? result.rows[0].kb_item_id : null;
};

const countReviewItemsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     WHERE woi.work_order_id = $1 AND c.status = 'CODER_REVIEW'`,
    [workOrderId]
  );
  return result.rows[0].count;
};

const reviewClassification = async ({
  work_order_item_id,
  fw_related,
  complexity_level_id,
  classification_reason,
  reviewed_by,
  input_hash,
  kb_version,
  assist_response,
}) => {
  const result = await pool.query(
    `UPDATE classifications
     SET fw_related = $2,
         complexity_level_id = $3,
         classification_method = 'MANUAL',
         confidence_score = 100,
         classification_reason = $4,
         status = CASE WHEN $2 THEN 'CLASSIFIED' ELSE 'NON_FIRMWARE' END,
         reviewed_by = $5,
         reviewed_at = NOW(),
         input_hash = $6,
         kb_version = $7,
         assist_response = $8,
         updated_at = NOW()
     WHERE work_order_item_id = $1 AND status = 'CODER_REVIEW'
     RETURNING *`,
    [work_order_item_id, fw_related, complexity_level_id, classification_reason, reviewed_by, input_hash || null, kb_version == null ? null : kb_version, assist_response == null ? null : assist_response]
  );
  return result.rows[0] || null;
};

module.exports = {
  findAllKbItems,
  findAllRules,
  findConfidenceThresholds,
  upsertClassification,
  createMatch,
  deleteMatchesByClassificationId,
  findByItemId,
  findTopMatch,
  countReviewItemsByWorkOrderId,
  reviewClassification,
};