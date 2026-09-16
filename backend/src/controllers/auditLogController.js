const auditLogService = require('../services/auditLogService');

const listLogs = async (req, res, next) => {
  try {
    const data = await auditLogService.getAuditLog({
      page: req.query.page,
      limit: req.query.limit,
      search: typeof req.query.search === 'string' ? req.query.search.trim() : '',
      action: typeof req.query.action === 'string' ? req.query.action : 'ALL',
      userId: typeof req.query.user_id === 'string' ? req.query.user_id : 'ALL',
      workOrderId: typeof req.query.work_order_id === 'string' ? req.query.work_order_id : 'ALL',
      dateFrom: typeof req.query.date_from === 'string' ? req.query.date_from.trim() : '',
      dateTo: typeof req.query.date_to === 'string' ? req.query.date_to.trim() : '',
    });
    res.json({ success: true, message: 'Audit log retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { listLogs };