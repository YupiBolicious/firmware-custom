const pool = require('../config/db');

const findByUsername = async (username) => {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.full_name, u.is_active
     FROM users u
     WHERE u.username = $1`,
    [username]
  );
  return result.rows[0] || null;
};

const findRolesByUserId = async (userId) => {
  const result = await pool.query(
    `SELECT r.code
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return result.rows.map((row) => row.code);
};

module.exports = { findByUsername, findRolesByUserId };