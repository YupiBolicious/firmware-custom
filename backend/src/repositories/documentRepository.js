const pool = require('../config/db');

const create = async ({ work_order_id, filename, original_name, mime_type, size_bytes, description, uploaded_by }) => {
  const result = await pool.query(
    `INSERT INTO work_order_documents (work_order_id, filename, original_name, mime_type, size_bytes, description, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [work_order_id, filename, original_name, mime_type || null, size_bytes || 0, description || null, uploaded_by]
  );
  return result.rows[0];
};

const findByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT d.*, u.full_name AS uploaded_by_name
     FROM work_order_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.work_order_id = $1
     ORDER BY d.created_at DESC`,
    [workOrderId]
  );
  return result.rows;
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT * FROM work_order_documents WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const remove = async (id) => {
  const result = await pool.query(
    `DELETE FROM work_order_documents WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
};

const countByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM work_order_documents WHERE work_order_id = $1`,
    [workOrderId]
  );
  return result.rows[0].count;
};

module.exports = { create, findByWorkOrderId, findById, remove, countByWorkOrderId };
