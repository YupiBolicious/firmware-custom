const coderDashboardService = require('../services/coderDashboardService');
const allCoderDbService = require('../services/allCoderDbService');
const { assertOptionalDate } = require('../utils/validation');

const getDashboardFilters = (query) => {
  const toInt = (v, fallback) => {
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  const dateFrom = typeof query.date_from === 'string' ? query.date_from.trim() : '';
  const dateTo = typeof query.date_to === 'string' ? query.date_to.trim() : '';
  assertOptionalDate('date_from', dateFrom);
  assertOptionalDate('date_to', dateTo);
  return {
    workOrderPage: toInt(query.work_order_page, 1),
    workOrderSearch: typeof query.work_order_search === 'string' ? query.work_order_search.trim() : '',
    workOrderStatus: typeof query.work_order_status === 'string' && query.work_order_status ? query.work_order_status : 'ALL',
    complexity: typeof query.complexity === 'string' && query.complexity ? query.complexity : 'ALL',
    classificationStatus: typeof query.classification_status === 'string' && query.classification_status ? query.classification_status : 'ALL',
    dateFrom,
    dateTo,
  };
};

const getCoderDashboard = async (req, res, next) => {
  try {
    const data = await coderDashboardService.getCoderDashboard(req.user.id, getDashboardFilters(req.query));
    res.json({ success: true, message: 'Coder dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

const getTeamCoderDashboard = async (req, res, next) => {
  try {
    const data = await allCoderDbService.allCoderDashboard(getDashboardFilters(req.query));
    res.json({ success: true, message: 'Coder team dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCoderDashboard, getTeamCoderDashboard };
