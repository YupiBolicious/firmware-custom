const reportService = require('../services/reportService');

const getQuarterlyReport = async (req, res, next) => {
  try {
    const data = await reportService.getQuarterlyReport(req.query);
    res.json({ success: true, message: 'Quarterly report retrieved', data });
  } catch (err) {
    next(err);
  }
};

const getHistoricalReport = async (req, res, next) => {
  try {
    const data = await reportService.getHistoricalReport(req.query);
    res.json({ success: true, message: 'Historical quarterly report retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getQuarterlyReport, getHistoricalReport };