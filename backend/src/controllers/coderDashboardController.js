const coderDashboardService = require('../services/coderDashboardService');

const getCoderDashboard = async (req, res, next) => {
  try {
    const data = await coderDashboardService.getCoderDashboard(req.user.id);
    res.json({ success: true, message: 'Coder dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCoderDashboard };
