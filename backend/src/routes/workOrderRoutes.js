const express = require('express');
const multer = require('multer');
const path = require('path');
const workOrderController = require('../controllers/workOrderController');
const { authenticate, authorize } = require('../middleware/auth');
const {
  validateWorkOrderCreate,
  validateWorkOrderUpdate,
  validateGroupCreate,
  validateGroupUpdate,
  validateItemCreate,
  validateItemUpdate,
  validateReview,
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

router.use(authenticate);

router.put('/items/:itemId', authorize('PM', 'ADMIN'), validateItemUpdate, workOrderController.updateItem);
router.delete('/items/:itemId', authorize('PM', 'ADMIN'), workOrderController.deleteItem);

router.get('/', authorize('PM', 'CODER', 'ADMIN'), workOrderController.list);
router.get('/review-queue', authorize('CODER', 'ADMIN'), workOrderController.reviewQueue);
router.post('/items/:itemId/review', authorize('CODER', 'ADMIN'), validateReview, workOrderController.reviewItem);
router.post('/', authorize('PM', 'ADMIN'), validateWorkOrderCreate, workOrderController.create);
router.get('/:id', authorize('PM', 'CODER', 'ADMIN'), workOrderController.getById);
router.put('/:id', authorize('PM', 'ADMIN'), validateWorkOrderUpdate, workOrderController.update);

router.post('/:id/groups', authorize('PM', 'ADMIN'), validateGroupCreate, workOrderController.addGroup);
router.put('/:id/groups/:groupId', authorize('PM', 'ADMIN'), validateGroupUpdate, workOrderController.updateGroup);
router.delete('/:id/groups/:groupId', authorize('PM', 'ADMIN'), workOrderController.deleteGroup);

router.post('/:id/items', authorize('PM', 'ADMIN'), validateItemCreate, workOrderController.addItem);

router.post('/:id/analyze', authorize('PM', 'ADMIN'), workOrderController.analyze);
router.post('/:id/finalize', authorize('PM', 'ADMIN'), workOrderController.finalize);
router.post('/:id/production', authorize('CODER', 'ADMIN'), workOrderController.startProduction);

router.get('/:id/documents', authorize('PM', 'CODER', 'ADMIN'), workOrderController.listDocuments);
router.get('/:id/documents/:docId/download', authorize('PM', 'CODER', 'ADMIN'), workOrderController.downloadDocument);
router.post('/:id/documents', authorize('CODER', 'ADMIN'), upload.array('files', 10), workOrderController.uploadDocuments);
router.delete('/:id/documents/:docId', authorize('CODER', 'ADMIN'), workOrderController.deleteDocument);

module.exports = router;
