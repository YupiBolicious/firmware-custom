const auditLogService = require('../services/auditLogService');
const { assertOptionalDate, assertOptionalInt } = require('../utils/validation');

const listLogs = async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const action = typeof req.query.action === 'string' ? req.query.action : 'ALL';
    const userId = typeof req.query.user_id === 'string' ? req.query.user_id : 'ALL';
    const workOrderId = typeof req.query.work_order_id === 'string' ? req.query.work_order_id : 'ALL';
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from.trim() : '';
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to.trim() : '';

    assertOptionalDate('date_from', dateFrom);
    assertOptionalDate('date_to', dateTo);
    if (userId !== 'ALL') assertOptionalInt('user_id', userId);
    if (workOrderId !== 'ALL') assertOptionalInt('work_order_id', workOrderId);

    const data = await auditLogService.getAuditLog({
      page: req.query.page,
      limit: req.query.limit,
      search,
      action,
      userId,
      workOrderId,
      dateFrom,
      dateTo,
    });
    res.json({ success: true, message: 'Audit log retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { listLogs };