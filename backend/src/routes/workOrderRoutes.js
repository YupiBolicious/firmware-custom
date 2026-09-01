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

router.put('/items/:itemId', authorize('PM'), validateItemUpdate, workOrderController.updateItem);
router.delete('/items/:itemId', authorize('PM'), workOrderController.deleteItem);

router.get('/', authorize('PM', 'CODER'), workOrderController.list);
router.get('/review-queue', authorize('CODER'), workOrderController.reviewQueue);
router.post('/items/:itemId/review', authorize('CODER'), validateReview, workOrderController.reviewItem);
router.post('/', authorize('PM'), validateWorkOrderCreate, workOrderController.create);
router.get('/:id', authorize('PM', 'CODER'), workOrderController.getById);
router.put('/:id', authorize('PM'), validateWorkOrderUpdate, workOrderController.update);

router.post('/:id/groups', authorize('PM'), validateGroupCreate, workOrderController.addGroup);
router.put('/:id/groups/:groupId', authorize('PM'), validateGroupUpdate, workOrderController.updateGroup);
router.delete('/:id/groups/:groupId', authorize('PM'), workOrderController.deleteGroup);

router.post('/:id/items', authorize('PM'), validateItemCreate, workOrderController.addItem);

router.post('/:id/analyze', authorize('PM'), workOrderController.analyze);
router.post('/:id/finalize', authorize('PM'), workOrderController.finalize);
router.get('/:id/access', authorize('PM', 'CODER'), workOrderController.listAccess);
router.post('/:id/access', authorize('PM'), workOrderController.grantAccess);
router.delete('/:id/access/:userId', authorize('PM'), workOrderController.revokeAccess);
router.post('/:id/production', authorize('CODER'), workOrderController.startProduction);
router.post('/:id/production/complete', authorize('CODER'), workOrderController.completeProduction);

router.get('/:id/documents', authorize('PM', 'CODER'), workOrderController.listDocuments);
router.get('/:id/documents/:docId/download', authorize('PM', 'CODER'), workOrderController.downloadDocument);
router.post('/:id/documents', authorize('CODER'), upload.array('files', 10), workOrderController.uploadDocuments);
router.delete('/:id/documents/:docId', authorize('CODER'), workOrderController.deleteDocument);

module.exports = router;
