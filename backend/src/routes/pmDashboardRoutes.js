const express = require('express');
const pmDashboardController = require('../controllers/pmDashboardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('PM'));

router.get('/', pmDashboardController.getPMDashboard);

module.exports = router;
