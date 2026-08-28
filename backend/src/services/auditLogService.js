const auditLogRepository = require('../repositories/auditLogRepository');
const { ApiError } = require('../middleware/errorHandler');

const MAX_LIMIT = 1000;

const getAuditLog = async ({ limit }) => {
  const parsedLimit = Number(limit);
  if (limit && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT)) {
    throw new ApiError(400, `Limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  const [items, actions, users] = await Promise.all([
    auditLogRepository.findAll(parsedLimit || auditLogRepository.DEFAULT_LIMIT),
    auditLogRepository.findActions(),
    auditLogRepository.findUsers(),
  ]);
  return { items, actions, users };
};

module.exports = { getAuditLog };