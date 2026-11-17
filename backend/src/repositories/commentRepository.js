const pool = require('../config/db');

// ---------- Work Order Comments ----------
const findCommentsByWorkOrderId = async (workOrderId) => {
  const result = await pool.query(
    `SELECT c.id, c.work_order_id, c.user_id, c.content, c.created_at, c.updated_at,
            u.full_name, u.username,
            (SELECT string_agg(r.code, ',') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
     FROM work_order_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.work_order_id = $1
     ORDER BY c.created_at ASC, c.id ASC`,
    [workOrderId]
  );
  return result.rows;
};

const createComment = async ({ work_order_id, user_id, content }) => {
  const result = await pool.query(
    `INSERT INTO work_order_comments (work_order_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, work_order_id, user_id, content, created_at, updated_at`,
    [work_order_id, user_id, content]
  );
  return result.rows[0];
};

const deleteComment = async (commentId) => {
  const result = await pool.query(
    `DELETE FROM work_order_comments WHERE id = $1 RETURNING id`,
    [commentId]
  );
  return result.rows[0] || null;
};

const findCommentById = async (commentId) => {
  const result = await pool.query(
    `SELECT c.*, u.full_name, u.username
     FROM work_order_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1`,
    [commentId]
  );
  return result.rows[0] || null;
};

module.exports = {
    findCommentsByWorkOrderId,
    createComment,
    deleteComment,
    findCommentById
};