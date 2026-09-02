const express = require('express');
const machineModelController = require('../controllers/machineModelController');
const { authenticate, authorize } = require('../middleware/auth');
const { requireIntegerParams } = require('../middleware/validateParams');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), machineModelController.listModels);
router.post('/', authorize('ADMIN'), machineModelController.createModel);
router.get('/:id', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.getModel);
router.put('/:id', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.updateModel);
router.delete('/:id', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.removeModel);

router.get('/:id/versions', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.listVersions);
router.post('/:id/versions', authorize('ADMIN'), requireIntegerParams('id'), machineModelController.createVersion);
router.put('/versions/:versionId', authorize('ADMIN'), requireIntegerParams('versionId'), machineModelController.updateVersion);
router.delete('/versions/:versionId', authorize('ADMIN'), requireIntegerParams('versionId'), machineModelController.removeVersion);

module.exports = router;
