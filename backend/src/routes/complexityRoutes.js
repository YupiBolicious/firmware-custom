const express = require('express');
const complexityController = require('../controllers/complexityController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireIntegerParams } = require('../middleware/validateParams');

const router = express.Router();

router.use(authenticate);

router.get('/', complexityController.list);
router.post('/', authorize('ADMIN'), complexityController.create);
router.get('/:id', requireIntegerParams('id'), complexityController.getById);
router.put('/:id', authorize('ADMIN'), requireIntegerParams('id'), complexityController.update);
router.delete('/:id', authorize('ADMIN'), requireIntegerParams('id'), complexityController.remove);

module.exports = router;