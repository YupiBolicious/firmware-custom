const auditLogRepository = require('../repositories/auditLogRepository');
const { ApiError } = require('../middleware/errorHandler');

const MAX_LIMIT = 1000;

const getAuditLog = async ({ page = 1, limit = 50, search = '', action = 'ALL', userId = 'ALL', workOrderId = 'ALL', dateFrom = '', dateTo = '' } = {}) => {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new ApiError(400, 'Page must be a positive integer');
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    throw new ApiError(400, `Limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const [res, actions, users, workOrders] = await Promise.all([
    auditLogRepository.findAll({
      page: parsedPage,
      limit: parsedLimit,
      search,
      action: action !== 'ALL' ? action : '',
      userId: userId !== 'ALL' ? Number(userId) : '',
      workOrderId: workOrderId !== 'ALL' ? Number(workOrderId) : '',
      dateFrom,
      dateTo,
    }),
    auditLogRepository.findActions(),
    auditLogRepository.findUsers(),
    auditLogRepository.findWorkOrders(),
  ]);

  return {
    items: res.rows,
    total: res.total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.max(1, Math.ceil(res.total / parsedLimit)),
    actions,
    users,
    workOrders,
  };
};

module.exports = { getAuditLog };