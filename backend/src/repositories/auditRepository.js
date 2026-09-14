const pool = require('../config/db');

// Slim stored payload: drop null/undefined fields — they carry no information and account
// for most of the per-row bytes (audit bloat mitigation, see alter_audit_retention.sql).
const compactDetails = (details) => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return details == null ? null : JSON.stringify(details);
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return JSON.stringify(out);
};

const create = async ({ user_id, action, entity_type, entity_id, details, ip_address }) => {
  const result = await pool.query(
    `INSERT INTO audit_trail (user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user_id, action, entity_type, entity_id, compactDetails(details), ip_address || null]
  );
  return result.rows[0];
};

module.exports = { create };