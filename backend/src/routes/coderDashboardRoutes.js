const express = require('express');
const coderDashboardController = require('../controllers/coderDashboardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(authorize('CODER'));

router.get('/', coderDashboardController.getCoderDashboard);

module.exports = router;
