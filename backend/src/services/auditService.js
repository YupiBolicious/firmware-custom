const auditRepository = require('../repositories/auditRepository');

const log = async ({ user_id, action, entity_type, entity_id, details, ip_address }) => {
  try {
    await auditRepository.create({ user_id, action, entity_type, entity_id, details, ip_address });
  } catch (err) {
    // Audit logging should never break the main flow
    console.error('Audit log failed:', err.message);
  }
};

module.exports = { log };