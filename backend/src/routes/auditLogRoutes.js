const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'PM', 'CODER'), auditLogController.listLogs);

module.exports = router;