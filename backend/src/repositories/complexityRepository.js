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

const findByCode = async (code) => {
  const result = await pool.query(
    `SELECT id FROM complexity_levels WHERE code = $1`,
    [code]
  );
  return result.rows[0] || null;
};

const create = async ({ code, name, description, requirement_review_h, code_development_h, peer_review_fixing_h, bench_testing_h, unit_testing_h }) => {
  const result = await pool.query(
    `INSERT INTO complexity_levels
       (code, name, description, requirement_review_h, code_development_h,
        peer_review_fixing_h, bench_testing_h, unit_testing_h)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, code, name, description,
               requirement_review_h, code_development_h, peer_review_fixing_h,
               bench_testing_h, unit_testing_h, total_hours, is_active`,
    [code, name, description || null, requirement_review_h, code_development_h, peer_review_fixing_h, bench_testing_h, unit_testing_h]
  );
  return result.rows[0];
};

const update = async (id, { code, name, description, requirement_review_h, code_development_h, peer_review_fixing_h, bench_testing_h, unit_testing_h, is_active }) => {
  const result = await pool.query(
    `UPDATE complexity_levels
     SET code = COALESCE($2, code),
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         requirement_review_h = COALESCE($5, requirement_review_h),
         code_development_h = COALESCE($6, code_development_h),
         peer_review_fixing_h = COALESCE($7, peer_review_fixing_h),
         bench_testing_h = COALESCE($8, bench_testing_h),
         unit_testing_h = COALESCE($9, unit_testing_h),
         is_active = COALESCE($10, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, code, name, description,
               requirement_review_h, code_development_h, peer_review_fixing_h,
               bench_testing_h, unit_testing_h, total_hours, is_active`,
    [id, code, name, description, requirement_review_h, code_development_h, peer_review_fixing_h, bench_testing_h, unit_testing_h, is_active]
  );
  return result.rows[0] || null;
};

const remove = async (id) => {
  const result = await pool.query(
    `UPDATE complexity_levels SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = { findAll, findById, findByCode, create, update, remove };