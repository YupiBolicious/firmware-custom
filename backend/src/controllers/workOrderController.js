const workOrderService = require('../services/workOrderService');
const { ApiError } = require('../middleware/errorHandler');

const list = async (req, res, next) => {
  try {
    const data = await workOrderService.listWorkOrders();
    res.json({ success: true, message: 'Work orders retrieved', data });
  } catch (err) {
    next(err);
  }
};

const reviewQueue = async (req, res, next) => {
  try {
    const data = await workOrderService.listCoderReviewQueue();
    res.json({ success: true, message: 'Coder review queue retrieved', data });
  } catch (err) {
    next(err);
  }
};

const reviewItem = async (req, res, next) => {
  try {
    const data = await workOrderService.reviewItem(req.params.itemId, {
      ...req.body,
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Item review confirmed', data });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await workOrderService.getWorkOrder(req.params.id);
    res.json({ success: true, message: 'Work order retrieved', data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await workOrderService.createWorkOrder({
      ...req.body,
      created_by: req.user.id,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'Work order created successfully', data });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await workOrderService.updateWorkOrder(req.params.id, {
      ...req.body,
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order updated successfully', data });
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const data = await workOrderService.addItem(req.params.id, {
      ...req.body,
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'Item added successfully', data });
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const data = await workOrderService.updateItem(req.params.itemId, {
      ...req.body,
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Item updated successfully', data });
  } catch (err) {
    next(err);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    const data = await workOrderService.deleteItem(req.params.itemId, {
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Item deleted successfully', data });
  } catch (err) {
    next(err);
  }
};

const analyze = async (req, res, next) => {
  try {
    const data = await workOrderService.analyzeWorkOrder(req.params.id, {
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order analyzed successfully', data });
  } catch (err) {
    next(err);
  }
};

const finalize = async (req, res, next) => {
  try {
    const data = await workOrderService.finalizeWorkOrder(req.params.id, {
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order finalized successfully', data });
  } catch (err) {
    next(err);
  }
};

const startProduction = async (req, res, next) => {
  try {
    const data = await workOrderService.startProduction(req.params.id, {
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order moved to production', data });
  } catch (err) {
    next(err);
  }
};

const completeProduction = async (req, res, next) => {
  try {
    const data = await workOrderService.completeProduction(req.params.id, {
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order completed', data });
  } catch (err) {
    next(err);
  }
};

const uploadDocuments = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next(new ApiError(400, 'No files uploaded'));
    }
    const data = await workOrderService.uploadDocuments(req.params.id, req.files, {
      user_id: req.user.id,
      description: req.body.description,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'Documents uploaded', data });
  } catch (err) {
    next(err);
  }
};

const listDocuments = async (req, res, next) => {
  try {
    const data = await workOrderService.listDocuments(req.params.id);
    res.json({ success: true, message: 'Documents retrieved', data });
  } catch (err) {
    next(err);
  }
};

const deleteDocument = async (req, res, next) => {
  try {
    const data = await workOrderService.deleteDocument(req.params.docId, {
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Document deleted', data });
  } catch (err) {
    next(err);
  }
};

const downloadDocument = async (req, res, next) => {
  try {
    const documentRepository = require('../repositories/documentRepository');
    const doc = await documentRepository.findById(req.params.docId);
    if (!doc) return next(new ApiError(404, 'Document not found'));
    const filePath = require('path').join(__dirname, '..', '..', 'uploads', doc.filename);
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return next(new ApiError(404, 'File not found on disk'));
    res.download(filePath, doc.original_name);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  reviewQueue,
  reviewItem,
  getById,
  create,
  update,
  addItem,
  updateItem,
  deleteItem,
  analyze,
  finalize,
  startProduction,
  completeProduction,
  uploadDocuments,
  listDocuments,
  deleteDocument,
  downloadDocument,
};