const express = require('express');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireIntegerParams } = require('../middleware/validateParams');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), userController.list);
router.get('/pm', authorize('PM', 'ADMIN'), userController.listPmUsers);
router.post('/', authorize('ADMIN'), userController.create);
router.put('/:id', authorize('ADMIN'), requireIntegerParams('id'), userController.update);
router.post('/:id/reset-password', authorize('ADMIN'), requireIntegerParams('id'), userController.resetPassword);

module.exports = router;