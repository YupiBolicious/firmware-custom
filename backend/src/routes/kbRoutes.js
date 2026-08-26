const express = require('express');
const kbController = require('../controllers/kbController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', kbController.list);
router.get('/:id', kbController.getById);
router.post('/:id/test', authorize('ADMIN'), kbController.testKbItem);
router.post('/', authorize('ADMIN'), kbController.create);
router.put('/:id', authorize('ADMIN'), kbController.update);
router.delete('/:id', authorize('ADMIN'), kbController.remove);

module.exports = router;