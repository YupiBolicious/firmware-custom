const express = require('express');
const gmailController = require('../controllers/gmailController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/oauth/start', authenticate, authorize('ADMIN'), gmailController.start);
router.get('/oauth/callback', gmailController.callback);
router.get('/messages', authenticate, authorize('ADMIN'), gmailController.list);
router.get('/messages/:id', authenticate, authorize('ADMIN'), gmailController.get);

router.post('/import', authenticate, authorize('ADMIN'), gmailController.importEmails);

module.exports = router;