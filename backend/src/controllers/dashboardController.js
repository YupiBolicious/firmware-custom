const dashboardService = require('../services/dashboardService');

const getDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboard();
    res.json({ success: true, message: 'Dashboard data retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboard };