const adminDashboardService = require('../services/adminDashboardService');
const { ApiError } = require('../middleware/errorHandler');
const { isRealDate } = require('../utils/validation');

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 90);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const getAdminDashboard = async (req, res, next) => {
  try {
    let { from, to } = req.query;
    const defaults = defaultRange();
    if (!to) to = defaults.to;
    if (!from) from = defaults.from;
    if (from && !isRealDate(from)) {
      return next(new ApiError(400, 'Validation failed', ['"from" must be a valid YYYY-MM-DD date']));
    }
    if (to && !isRealDate(to)) {
      return next(new ApiError(400, 'Validation failed', ['"to" must be a valid YYYY-MM-DD date']));
    }
    const data = await adminDashboardService.getAdminDashboard({ from, to });
    res.json({ success: true, message: 'Admin dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAdminDashboard };