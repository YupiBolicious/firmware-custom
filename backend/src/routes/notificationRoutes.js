const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.post('/mark-all-read', notificationController.markAllRead);
router.post('/:id/read', notificationController.markRead);

module.exports = router;
