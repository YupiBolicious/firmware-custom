const pool = require('../config/db');

// Fetch a complexity level by id (single source of truth for fixed hours)
const findComplexityLevelById = async (id) => {
  const result = await pool.query(
    `SELECT id, code, name, description,
            requirement_review_h, code_development_h, peer_review_fixing_h,
            bench_testing_h, unit_testing_h, total_hours
     FROM complexity_levels
     WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  return result.rows[0] || null;
};

// Upsert the current estimation for an item
const upsertEstimation = async ({
  work_order_item_id,
  complexity_level_id,
  requirement_review_h,
  code_development_h,
  peer_review_fixing_h,
  bench_testing_h,
  unit_testing_h,
  total_hours,
}) => {
  const result = await pool.query(
    `INSERT INTO item_estimations
       (work_order_item_id, complexity_level_id, requirement_review_h, code_development_h,
        peer_review_fixing_h, bench_testing_h, unit_testing_h, total_hours, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
     ON CONFLICT (work_order_item_id)
     DO UPDATE SET
       complexity_level_id = EXCLUDED.complexity_level_id,
       requirement_review_h = EXCLUDED.requirement_review_h,
       code_development_h = EXCLUDED.code_development_h,
       peer_review_fixing_h = EXCLUDED.peer_review_fixing_h,
       bench_testing_h = EXCLUDED.bench_testing_h,
       unit_testing_h = EXCLUDED.unit_testing_h,
       total_hours = EXCLUDED.total_hours,
       is_current = TRUE
     RETURNING *`,
    [
      work_order_item_id,
      complexity_level_id,
      requirement_review_h,
      code_development_h,
      peer_review_fixing_h,
      bench_testing_h,
      unit_testing_h,
      total_hours,
    ]
  );
  return result.rows[0];
};

// Delete estimation for an item (used when item becomes non-firmware)
const deleteByItemId = async (work_order_item_id) => {
  const result = await pool.query(
    `DELETE FROM item_estimations WHERE work_order_item_id = $1 RETURNING id`,
    [work_order_item_id]
  );
  return result.rows[0] || null;
};

module.exports = {
  findComplexityLevelById,
  upsertEstimation,
  deleteByItemId,
};