const pool = require('../config/db');

const findByIdentifier = async (identifier) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.full_name, u.is_active
     FROM users u
     WHERE u.email = $1 OR LOWER(u.username) = $1
     ORDER BY (u.email = $1) DESC, u.id
     LIMIT 1`,
    [identifier]
  );
  return result.rows[0] || null;
};

const findByIdWithPassword = async (id) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.full_name, u.is_active
     FROM users u
     WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const updatePasswordHash = async (userId, hash) => {
  const result = await pool.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [userId, hash]
  );
  return result.rows[0] || null;
};

const findEmailWithPassword = async(email) => {
  const result= await pool.query(
  `select u.id, u.username, u.email, u.password_hash, u.is_active
  from users u
  where u.email = $1`, [email]);
  return result.rows[0] || null;
}

module.exports = { findByIdentifier, findByIdWithPassword, updatePasswordHash, findEmailWithPassword };