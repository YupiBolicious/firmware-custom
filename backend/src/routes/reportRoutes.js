const express = require('express');
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('PM'));

router.get('/quarterly', reportController.getQuarterlyReport);
router.get('/historical', reportController.getHistoricalReport);

module.exports = router;