const auditLogService = require('../services/auditLogService');

const listLogs = async (req, res, next) => {
  try {
    const data = await auditLogService.getAuditLog({ limit: req.query.limit });
    res.json({ success: true, message: 'Audit log retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { listLogs };