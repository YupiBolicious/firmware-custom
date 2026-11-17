const pool = require('../config/db');

const findAllModels = async (id) => {
  const result = await pool.query(
    `SELECT * from machine_model where id = $1`, [id]
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

const findByCode = async (code) => {
  const result = await pool.query(
    `SELECT * FROM machine_model WHERE UPPER(model_code) = UPPER($1)`,
    [code]
  );
  return result.rows[0] || null;
};

const findOrCreateByCode = async (code) => {
  const existing = await findByCode(code);
  if (existing) return existing;
  try {
    return await createModel({ model_code: code.toUpperCase(), name: code.toUpperCase(), description: null });
  } catch (err) {
    if (err.code === '23505') {
      const recheck = await findByCode(code);
      if (recheck) return recheck;
    }
    throw err;
  }
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
         description = COALESCE($4, description)
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


module.exports = {
  findAllModels,
  findModelById,
  findByCode,
  findOrCreateByCode,
  createModel,
  updateModel,
  removeModel,
};
