const pool = require('../config/db');

const create = async ({ user_id, action, entity_type, entity_id, details, ip_address }) => {
  const result = await pool.query(
    `INSERT INTO audit_trail (user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user_id, action, entity_type, entity_id, details ? JSON.stringify(details) : null, ip_address || null]
  );
  return result.rows[0];
};

module.exports = { create };