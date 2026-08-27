const pmDashboardService = require('../services/pmDashboardService');

const getPMDashboard = async (req, res, next) => {
  try {
    const data = await pmDashboardService.getPMDashboard();
    res.json({ success: true, message: 'PM dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPMDashboard };
