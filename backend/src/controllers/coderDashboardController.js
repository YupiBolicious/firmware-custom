const coderDashboardService = require('../services/coderDashboardService');
const { assertOptionalDate } = require('../utils/validation');

const getCoderDashboard = async (req, res, next) => {
  try {
    const toInt = (v, fallback) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 ? n : fallback;
    };
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from.trim() : '';
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to.trim() : '';
    assertOptionalDate('date_from', dateFrom);
    assertOptionalDate('date_to', dateTo);
    const data = await coderDashboardService.getCoderDashboard(req.user.id, {
      activityPage: toInt(req.query.activity_page, 1),
      newWoPage: toInt(req.query.new_wo_page, 1),
      limit: Math.min(toInt(req.query.limit, 15), 100),
      workOrderPage: toInt(req.query.work_order_page, 1),
      workOrderSearch: typeof req.query.work_order_search === 'string' ? req.query.work_order_search.trim() : '',
      workOrderStatus: typeof req.query.work_order_status === 'string' && req.query.work_order_status ? req.query.work_order_status : 'ALL',
      complexity: typeof req.query.complexity === 'string' && req.query.complexity ? req.query.complexity : 'ALL',
      classificationStatus: typeof req.query.classification_status === 'string' && req.query.classification_status ? req.query.classification_status : 'ALL',
      dateFrom,
      dateTo,
    });
    res.json({ success: true, message: 'Coder dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCoderDashboard };
