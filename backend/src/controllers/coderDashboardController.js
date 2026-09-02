const coderDashboardService = require('../services/coderDashboardService');

const getCoderDashboard = async (req, res, next) => {
  try {
    const toInt = (v, fallback) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 ? n : fallback;
    };
    const data = await coderDashboardService.getCoderDashboard(req.user.id, {
      activityPage: toInt(req.query.activity_page, 1),
      newWoPage: toInt(req.query.new_wo_page, 1),
      limit: Math.min(toInt(req.query.limit, 15), 100),
    });
    res.json({ success: true, message: 'Coder dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCoderDashboard };
