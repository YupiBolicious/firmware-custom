const express = require('express');
const machineModelController = require('../controllers/machineModelController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', machineModelController.listModels);
router.post('/', authorize('ADMIN'), machineModelController.createModel);
router.get('/:id', machineModelController.getModel);
router.put('/:id', authorize('ADMIN'), machineModelController.updateModel);
router.delete('/:id', authorize('ADMIN'), machineModelController.removeModel);

router.get('/:id/versions', machineModelController.listVersions);
router.post('/:id/versions', authorize('ADMIN'), machineModelController.createVersion);
router.put('/versions/:versionId', authorize('ADMIN'), machineModelController.updateVersion);
router.delete('/versions/:versionId', authorize('ADMIN'), machineModelController.removeVersion);

module.exports = router;
