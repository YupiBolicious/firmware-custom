const express = require('express');
const workOrderController = require('../controllers/workOrderController');
const { authenticate, authorize } = require('../middleware/auth');
const {
  validateWorkOrderCreate,
  validateWorkOrderUpdate,
  validateItemCreate,
  validateItemUpdate,
  validateReview,
} = require('../validators/workOrderValidator');

const router = express.Router();

// All work order routes require authentication
router.use(authenticate);

// Item routes must be declared BEFORE /:id routes to avoid conflicts
router.put('/items/:itemId', authorize('PM'), validateItemUpdate, workOrderController.updateItem);
router.delete('/items/:itemId', authorize('PM'), workOrderController.deleteItem);

// Work Orders — PM only for create/update; read for all authenticated
router.get('/', authorize('PM', 'CODER'), workOrderController.list);
router.get('/review-queue', authorize('CODER'), workOrderController.reviewQueue);
router.post('/items/:itemId/review', authorize('CODER'), validateReview, workOrderController.reviewItem);
router.post('/', authorize('PM'), validateWorkOrderCreate, workOrderController.create);
router.get('/:id', authorize('PM', 'CODER'), workOrderController.getById);
router.put('/:id', authorize('PM'), validateWorkOrderUpdate, workOrderController.update);

// Items (nested under work order)
router.post('/:id/items', authorize('PM'), validateItemCreate, workOrderController.addItem);

// Analyze
router.post('/:id/analyze', authorize('PM'), workOrderController.analyze);
router.post('/:id/finalize', authorize('PM'), workOrderController.finalize);

module.exports = router;