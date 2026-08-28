const adminDashboardService = require('../services/adminDashboardService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 8 * 7);
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
    if (from && !DATE_RE.test(from)) {
      return res.status(400).json({ success: false, message: 'Invalid "from" parameter (expected YYYY-MM-DD)' });
    }
    if (to && !DATE_RE.test(to)) {
      return res.status(400).json({ success: false, message: 'Invalid "to" parameter (expected YYYY-MM-DD)' });
    }
    const data = await adminDashboardService.getAdminDashboard({ from, to });
    res.json({ success: true, message: 'Admin dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAdminDashboard };