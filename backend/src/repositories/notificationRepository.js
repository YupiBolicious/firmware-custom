const pool = require('../config/db');

const create = async ({ user_id, status, message, entity_id }) => {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, status, message, entity_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, status, message, entity_id, is_read, created_at`,
    [user_id, status, message, entity_id ?? null]
  );
  return result.rows[0];
};

const findByUserId = async (userId, limit = 50) => {
  const result = await pool.query(
    `SELECT id, user_id,  status, message, entity_id, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};

const countUnread = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return result.rows[0].count;
};

const markRead = async (userId, id) => {
  const result = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );
  return result.rowCount > 0;
};

const markAllRead = async (userId) => {
  const result = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return result.rowCount;
};

const deleteByEntityAndStatus = async (entityId, status) => {
  const result = await pool.query(
    `DELETE FROM notifications
     WHERE entity_id = $1 AND status = $2 AND is_read = FALSE
     RETURNING id`,
    [entityId, status]
  );
  return result.rowCount;
};

module.exports = { create, findByUserId, countUnread, markRead, markAllRead, deleteByEntityAndStatus };
