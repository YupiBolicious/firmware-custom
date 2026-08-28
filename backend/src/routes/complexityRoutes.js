const express = require('express');
const complexityController = require('../controllers/complexityController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', complexityController.list);
router.post('/', authorize('ADMIN'), complexityController.create);
router.get('/:id', complexityController.getById);
router.put('/:id', authorize('ADMIN'), complexityController.update);
router.delete('/:id', authorize('ADMIN'), complexityController.remove);

module.exports = router;