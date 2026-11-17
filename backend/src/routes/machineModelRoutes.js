const express = require('express');
const machineModelController = require('../controllers/machineModelController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireIntegerParams } = require('../middleware/validateParams');
const {
  validateModelCreate,
  validateModelUpdate,
  validateVersionCreate,
  validateVersionUpdate,
} = require('../validators/machineModelValidator');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), machineModelController.listModels);
router.post('/', authorize('ADMIN'), validateModelCreate, machineModelController.createModel);
router.get('/:id', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.getModel);
router.put('/:id', authorize('ADMIN'), requireIntegerParams('id'), validateModelUpdate, machineModelController.updateModel);
router.delete('/:id', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.removeModel);

module.exports = router;
