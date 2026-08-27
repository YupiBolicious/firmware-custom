const pool = require('../config/db');

const findAllModels = async () => {
  const result = await pool.query(
    `SELECT mm.*, COUNT(mmv.id)::int AS version_count
     FROM machine_model mm
     LEFT JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id AND mmv.is_active = TRUE
     WHERE mm.is_active = TRUE
     GROUP BY mm.id
     ORDER BY mm.model_code`
  );
  return result.rows;
};

const findModelById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM machine_model WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const createModel = async ({ model_code, name, description }) => {
  const result = await pool.query(
    `INSERT INTO machine_model (model_code, name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [model_code, name, description || null]
  );
  return result.rows[0];
};

const updateModel = async (id, { model_code, name, description }) => {
  const result = await pool.query(
    `UPDATE machine_model
     SET model_code = COALESCE($2, model_code),
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, model_code, name, description]
  );
  return result.rows[0] || null;
};

const removeModel = async (id) => {
  const result = await pool.query(
    `UPDATE machine_model SET is_active = FALSE WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

const findVersionsByModelId = async (modelId) => {
  const result = await pool.query(
    `SELECT * FROM machine_model_ver
     WHERE machine_model_id = $1 AND is_active = TRUE
     ORDER BY version_code`,
    [modelId]
  );
  return result.rows;
};

const findVersionById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM machine_model_ver WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const createVersion = async ({ machine_model_id, version_code, description }) => {
  const result = await pool.query(
    `INSERT INTO machine_model_ver (machine_model_id, version_code, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [machine_model_id, version_code, description || null]
  );
  return result.rows[0];
};

const updateVersion = async (id, { version_code, description }) => {
  const result = await pool.query(
    `UPDATE machine_model_ver
     SET version_code = COALESCE($2, version_code),
         description = COALESCE($3, description)
     WHERE id = $1
     RETURNING *`,
    [id, version_code, description]
  );
  return result.rows[0] || null;
};

const removeVersion = async (id) => {
  const result = await pool.query(
    `UPDATE machine_model_ver SET is_active = FALSE WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  findAllModels,
  findModelById,
  createModel,
  updateModel,
  removeModel,
  findVersionsByModelId,
  findVersionById,
  createVersion,
  updateVersion,
  removeVersion,
};
