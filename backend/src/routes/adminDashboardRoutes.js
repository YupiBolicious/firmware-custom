const express = require('express');
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/', adminDashboardController.getAdminDashboard);

module.exports = router;