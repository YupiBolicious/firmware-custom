const express = require('express');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), userController.list);
router.post('/', authorize('ADMIN'), userController.create);
router.put('/:id', authorize('ADMIN'), userController.update);
router.post('/:id/reset-password', authorize('ADMIN'), userController.resetPassword);

module.exports = router;