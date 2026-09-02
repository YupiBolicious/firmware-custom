const express = require('express');
const kbController = require('../controllers/kbController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireIntegerParams } = require('../middleware/validateParams');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), kbController.list);
router.get('/:id', authorize('ADMIN'), requireIntegerParams('id'), kbController.getById);
router.post('/:id/test', authorize('ADMIN'), requireIntegerParams('id'), kbController.testKbItem);
router.post('/', authorize('ADMIN'), kbController.create);
router.put('/:id', authorize('ADMIN'), requireIntegerParams('id'), kbController.update);
router.delete('/:id', authorize('ADMIN'), requireIntegerParams('id'), kbController.remove);

module.exports = router;