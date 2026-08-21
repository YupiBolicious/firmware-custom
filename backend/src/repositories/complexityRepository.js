const pool = require('../config/db');

const findAll = async () => {
  const result = await pool.query(
    `SELECT id, code, name, description,
            requirement_review_h, code_development_h, peer_review_fixing_h,
            bench_testing_h, unit_testing_h, total_hours, is_active
     FROM complexity_levels
     ORDER BY id`
  );
  return result.rows;
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT id, code, name, description,
            requirement_review_h, code_development_h, peer_review_fixing_h,
            bench_testing_h, unit_testing_h, total_hours, is_active
     FROM complexity_levels
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = { findAll, findById };