const adminDashboardService = require('../services/adminDashboardService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Format match is not enough: values like 2026-13-99 pass the regex but are
// not real calendar dates and would blow up in Postgres (22008 -> 500).
const isRealDate = (s) => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

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
    if (from && !isRealDate(from)) {
      return res.status(400).json({ success: false, message: 'Invalid "from" parameter (expected YYYY-MM-DD)' });
    }
    if (to && !isRealDate(to)) {
      return res.status(400).json({ success: false, message: 'Invalid "to" parameter (expected YYYY-MM-DD)' });
    }
    const data = await adminDashboardService.getAdminDashboard({ from, to });
    res.json({ success: true, message: 'Admin dashboard retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAdminDashboard };