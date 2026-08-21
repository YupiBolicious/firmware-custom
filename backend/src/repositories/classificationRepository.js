const pool = require('../config/db');

// Fetch all active KB items for matching
const findAllKbItems = async () => {
  const result = await pool.query(
    `SELECT id, kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score
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

// Upsert a classification for an item
const upsertClassification = async ({
  work_order_item_id,
  fw_related,
  complexity_level_id,
  classification_method,
  confidence_score,
  classification_reason,
  status,
}) => {
  const result = await pool.query(
    `INSERT INTO classifications
       (work_order_item_id, fw_related, complexity_level_id, classification_method,
        confidence_score, classification_reason, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (work_order_item_id)
     DO UPDATE SET
       fw_related = EXCLUDED.fw_related,
       complexity_level_id = EXCLUDED.complexity_level_id,
       classification_method = EXCLUDED.classification_method,
       confidence_score = EXCLUDED.confidence_score,
       classification_reason = EXCLUDED.classification_reason,
       status = EXCLUDED.status,
       updated_at = NOW()
     RETURNING *`,
    [
      work_order_item_id,
      fw_related,
      complexity_level_id,
      classification_method,
      confidence_score,
      classification_reason,
      status,
    ]
  );
  return result.rows[0];
};

// Record a classification match (for traceability)
const createMatch = async ({ classification_id, kb_item_id, rule_id, match_type, match_score }) => {
  const result = await pool.query(
    `INSERT INTO classification_matches (classification_id, kb_item_id, rule_id, match_type, match_score)
     VALUES ($1, $2, $3, $4, $5)
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

const reviewClassification = async ({
  work_order_item_id,
  fw_related,
  complexity_level_id,
  classification_reason,
  reviewed_by,
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
         updated_at = NOW()
     WHERE work_order_item_id = $1 AND status = 'CODER_REVIEW'
     RETURNING *`,
    [work_order_item_id, fw_related, complexity_level_id, classification_reason, reviewed_by]
  );
  return result.rows[0] || null;
};

module.exports = {
  findAllKbItems,
  findAllRules,
  findConfidenceThresholds,
  upsertClassification,
  createMatch,
  findByItemId,
  reviewClassification,
};