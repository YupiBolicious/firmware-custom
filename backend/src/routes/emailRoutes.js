const express = require('express');
const emailController = require('../controllers/emailController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/oauth/start', authenticate, authorize('ADMIN'), emailController.start);
router.get('/oauth/callback', emailController.callback);
router.get('/messages', authenticate, authorize('ADMIN'), emailController.list);
router.get('/messages/:id', authenticate, authorize('ADMIN'), emailController.get);

router.post('/import', authenticate, authorize('ADMIN'), emailController.importEmails);

module.exports = router;