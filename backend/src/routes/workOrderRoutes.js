const express = require('express');
const multer = require('multer');
const path = require('path');
const workOrderController = require('../controllers/workOrderController');
const { authenticate, authorize } = require('../middleware/auth');
const { ApiError } = require('../middleware/errorHandler');
const { requireIntegerParams } = require('../middleware/validateParams');
const {
  validateWorkOrderCreate,
  validateWorkOrderUpdate,
  validateGroupCreate,
  validateGroupUpdate,
  validateItemCreate,
  validateItemUpdate,
  validateReview,
  validateProductionTaskUpdate,
  validateAccessGrant,
  validateWorkOrderNotes,
} = require('../validators/workOrderValidator');

const router = express.Router();

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.7z'];

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) return cb(null, true);
    cb(new Error(`File type "${ext}" not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  },
});

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') return cb(null, true);
    cb(new ApiError(400, 'Only PDF files are allowed'));
  },
});

router.use(authenticate);

router.put('/items/:itemId', authorize('PM'), requireIntegerParams('itemId'), validateItemUpdate, workOrderController.updateItem);
router.delete('/items/:itemId', authorize('PM'), requireIntegerParams('itemId'), workOrderController.deleteItem);
router.post('/items/:itemId/review', authorize('CODER'), requireIntegerParams('itemId'), validateReview, workOrderController.reviewItem);

router.get('/', authorize('PM', 'CODER'), workOrderController.list);
router.get('/review-queue', authorize('CODER'), workOrderController.reviewQueue);
router.post('/', authorize('PM'), validateWorkOrderCreate, workOrderController.create);
router.post('/upload', authorize('PM'), uploadPdf.single('file'), workOrderController.previewWorkOrder);
router.post('/upload/confirm', authorize('PM'), workOrderController.confirmUploadWorkOrder);
router.get('/:id', authorize('PM', 'CODER'), requireIntegerParams('id'), workOrderController.getById);
router.put('/:id', authorize('PM'), requireIntegerParams('id'), validateWorkOrderUpdate, workOrderController.update);

router.post('/:id/groups', authorize('PM'), requireIntegerParams('id'), validateGroupCreate, workOrderController.addGroup);
router.put('/:id/groups/:groupId', authorize('PM'), requireIntegerParams('id', 'groupId'), validateGroupUpdate, workOrderController.updateGroup);
router.delete('/:id/groups/:groupId', authorize('PM'), requireIntegerParams('id', 'groupId'), workOrderController.deleteGroup);

router.post('/:id/items', authorize('PM'), requireIntegerParams('id'), validateItemCreate, workOrderController.addItem);

router.post('/:id/analyze', authorize('PM'), requireIntegerParams('id'), workOrderController.analyze);
router.post('/:id/finalize', authorize('PM'), requireIntegerParams('id'), workOrderController.finalize);
router.get('/:id/access', authorize('PM', 'CODER'), requireIntegerParams('id'), workOrderController.listAccess);
router.post('/:id/access', authorize('PM'), requireIntegerParams('id'), validateAccessGrant, workOrderController.grantAccess);
router.delete('/:id/access/:userId', authorize('PM'), requireIntegerParams('id', 'userId'), workOrderController.revokeAccess);
router.post('/:id/production', authorize('CODER'), requireIntegerParams('id'), workOrderController.startProduction);
router.put('/:id/production/tasks/:taskId', authorize('CODER'), requireIntegerParams('id', 'taskId'), validateProductionTaskUpdate, workOrderController.completeProductionTask);
router.post('/:id/production/complete', authorize('CODER'), requireIntegerParams('id'), workOrderController.completeProduction);

router.put('/:id/notes', authorize('CODER'), requireIntegerParams('id'), validateWorkOrderNotes, workOrderController.updateNotes);


module.exports = router;
