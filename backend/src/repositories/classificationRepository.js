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

const correctReviewedClassification = async ({ work_order_item_id, reviewed_by, complexity_level_id, reason }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemResult = await client.query(
      `SELECT woi.id, woi.work_order_id, woi.item_number, woi.title, woi.description,
              woi.documentation_readiness, wo.wo_number, wo.status AS work_order_status
       FROM work_order_items woi
       JOIN work_orders wo ON wo.id = woi.work_order_id
       WHERE woi.id = $1
       FOR UPDATE OF wo, woi`,
      [work_order_item_id]
    );
    const item = itemResult.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return { error: 'NOT_FOUND' };
    }
    if (['PRODUCTION', 'COMPLETED'].includes(item.work_order_status)) {
      await client.query('ROLLBACK');
      return { error: 'LOCKED' };
    }

    const classificationResult = await client.query(
      `SELECT c.*, cl.code AS old_complexity_code
       FROM classifications c
       LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
       WHERE c.work_order_item_id = $1
       FOR UPDATE OF c`,
      [work_order_item_id]
    );
    const classification = classificationResult.rows[0];
    if (!classification || !['CLASSIFIED', 'NON_FIRMWARE'].includes(classification.status)) {
      await client.query('ROLLBACK');
      return { error: 'NOT_REVIEWED' };
    }
    const levelResult = await client.query(
      `SELECT id, code, name, requirement_review_h, code_development_h,
              peer_review_fixing_h, bench_testing_h, unit_testing_h, total_hours
       FROM complexity_levels
       WHERE id = $1 AND is_active = TRUE AND code ~ '^L[0-5]$'`,
      [complexity_level_id]
    );
    const level = levelResult.rows[0];
    if (!level) {
      await client.query('ROLLBACK');
      return { error: 'INVALID_LEVEL' };
    }
    if (Number(classification.complexity_level_id) === Number(level.id)) {
      await client.query('ROLLBACK');
      return { error: 'UNCHANGED' };
    }

    const estimationResult = await client.query(
      `SELECT cl.id, cl.code, cl.name, cl.requirement_review_h, cl.code_development_h,
              cl.peer_review_fixing_h, cl.bench_testing_h, cl.unit_testing_h, cl.total_hours,
              CASE
                WHEN cl.code = 'L0' THEN 0
                WHEN $2 = 'MISSING' THEN COALESCE((
                  SELECT v.verification_mh FROM verification_levels v
                  WHERE v.code = 'V3' AND v.is_active = TRUE ORDER BY v.id LIMIT 1
                ), 0)
                ELSE COALESCE((
                  SELECT v.verification_mh
                  FROM complexity_verification_map m
                  JOIN verification_levels v ON v.id = m.verification_level_id
                  WHERE m.complexity_level_id = cl.id AND v.is_active = TRUE
                  ORDER BY v.id LIMIT 1
                ), 0)
              END AS verification_mh
       FROM complexity_levels cl
       WHERE cl.id = $1 AND cl.is_active = TRUE`,
      [level.id, item.documentation_readiness]
    );
    const estimate = estimationResult.rows[0];
    const previous = {
      complexity_level_id: classification.complexity_level_id,
      complexity_code: classification.old_complexity_code,
      fw_related: classification.fw_related,
      status: classification.status,
      reviewed_by: classification.reviewed_by,
      reviewed_at: classification.reviewed_at,
    };
    const fwRelated = level.code !== 'L0';
    const nextStatus = fwRelated ? 'CLASSIFIED' : 'NON_FIRMWARE';
    const updatedClassification = await client.query(
      `UPDATE classifications
       SET fw_related = $2,
           complexity_level_id = $3,
           classification_method = 'MANUAL',
           confidence_score = 100,
           classification_reason = $4,
           status = $5,
           reviewed_by = $6,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        classification.id,
        fwRelated,
        level.id,
        `Coder correction: ${previous.complexity_code || 'unknown'} to ${level.code}${reason ? ` — ${reason}` : ''}`,
        nextStatus,
        reviewed_by,
      ]
    );

    const totalHours = Number(estimate.total_hours) + Number(estimate.verification_mh);
    await client.query(
      `INSERT INTO item_estimations
         (work_order_item_id, complexity_level_id, requirement_review_h, code_development_h,
          peer_review_fixing_h, bench_testing_h, unit_testing_h, verification_mh, total_hours, is_current)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       ON CONFLICT (work_order_item_id)
       DO UPDATE SET complexity_level_id = EXCLUDED.complexity_level_id,
         requirement_review_h = EXCLUDED.requirement_review_h,
         code_development_h = EXCLUDED.code_development_h,
         peer_review_fixing_h = EXCLUDED.peer_review_fixing_h,
         bench_testing_h = EXCLUDED.bench_testing_h,
         unit_testing_h = EXCLUDED.unit_testing_h,
         verification_mh = EXCLUDED.verification_mh,
         total_hours = EXCLUDED.total_hours,
         is_current = TRUE`,
      [
        work_order_item_id, level.id, estimate.requirement_review_h,
        estimate.code_development_h, estimate.peer_review_fixing_h,
        estimate.bench_testing_h, estimate.unit_testing_h,
        estimate.verification_mh, totalHours,
      ]
    );

    const kbResult = await client.query(
      `INSERT INTO kb_items
         (kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score,
          source, is_active, machine_model_id, machine_model_version_id)
      SELECT $1::varchar(50), woi.title, woi.description,
        (SELECT existing.keywords FROM kb_items existing WHERE existing.kb_code = $1::varchar(50)),
        $2::boolean, $3::integer, 99, 'CODER_REVIEW', TRUE, g.machine_model_id, g.machine_model_version_id
       FROM work_order_items woi
       LEFT JOIN work_order_groups g ON g.id = woi.work_order_group_id
      WHERE woi.id = $4::integer
       ON CONFLICT (kb_code)
       DO UPDATE SET title = EXCLUDED.title,
         description = EXCLUDED.description,
         fw_related = EXCLUDED.fw_related,
         complexity_level_id = EXCLUDED.complexity_level_id,
         confidence_score = EXCLUDED.confidence_score,
         source = EXCLUDED.source,
         is_active = TRUE,
         machine_model_id = EXCLUDED.machine_model_id,
         machine_model_version_id = EXCLUDED.machine_model_version_id,
         updated_at = NOW()
       RETURNING id, kb_code`,
      [`KB-CODER-${work_order_item_id}`, fwRelated, level.id, work_order_item_id]
    );

    let productionTaskChange = null;
    if (item.work_order_status === 'FINALIZED') {
      if (fwRelated) {
        const task = await client.query(
          `INSERT INTO production_tasks (task_code, work_order_id, work_order_item_id, title, description)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (work_order_item_id)
           DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, updated_at = NOW()
           RETURNING id`,
          [`${item.wo_number}-${item.id}`, item.work_order_id, item.id, item.title, item.description]
        );
        productionTaskChange = { action: 'UPSERTED', task_id: task.rows[0]?.id || null };
      } else {
        const deleted = await client.query(
          'DELETE FROM production_tasks WHERE work_order_item_id = $1 RETURNING id',
          [item.id]
        );
        if (deleted.rows[0]) productionTaskChange = { action: 'REMOVED', task_id: deleted.rows[0].id };
      }
    }

    await client.query(
      `UPDATE kb_corpus_version SET version = version + 1, updated_at = NOW() WHERE id = 1`
    );
    await client.query('UPDATE work_orders SET updated_at = NOW() WHERE id = $1', [item.work_order_id]);
    await client.query('COMMIT');
    return {
      item,
      previous,
      classification: updatedClassification.rows[0],
      level,
      fw_related: fwRelated,
      status: nextStatus,
      estimated_hours: totalHours,
      verification_mh: Number(estimate.verification_mh),
      learned_kb: kbResult.rows[0] || null,
      production_task_change: productionTaskChange,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  correctReviewedClassification,
};
