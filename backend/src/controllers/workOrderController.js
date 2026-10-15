const workOrderService = require('../services/workOrderService');
const workOrderUploadService = require('../services/workOrderUploadService');
const { ApiError } = require('../middleware/errorHandler');

const list = async (req, res, next) => {
  try {
    const data = await workOrderService.listWorkOrders({ page: req.query.page, limit: req.query.limit, search: req.query.search, status: req.query.status });
    res.json({ success: true, message: 'Work orders retrieved', data });
  } catch (err) {
    next(err);
  }
};

const reviewQueue = async (req, res, next) => {
  try {
    const data = await workOrderService.listCoderReviewQueue({ page: req.query.page, limit: req.query.limit });
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
      roles: req.user.roles,
      ip_address: req.ip,
    });
    const revised = Boolean(data.revised);
    res.status(revised ? 200 : 201).json({
      success: true,
      message: revised
        ? `Work order ${data.wo_number} updated to revision ${data.revision}`
        : 'Work order created successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await workOrderService.updateWorkOrder(req.params.id, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order updated successfully', data });
  } catch (err) {
    next(err);
  }
};

const updateNotes = async (req, res, next) => {
  try {
    const data = await workOrderService.updateWorkOrderNotes(req.params.id, {
      notes: req.body.notes,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order note updated', data });
  } catch (err) {
    next(err);
  }
};

const addItem = async (req, res, next) => {
  try {
    const data = await workOrderService.addItem(req.params.id, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'Item added successfully', data });
  } catch (err) {
    next(err);
  }
};

const addGroup = async (req, res, next) => {
  try {
    const data = await workOrderService.addGroup(req.params.id, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'Group added successfully', data });
  } catch (err) {
    next(err);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    const data = await workOrderService.updateGroup(req.params.id, req.params.groupId, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Group updated successfully', data });
  } catch (err) {
    next(err);
  }
};

const deleteGroup = async (req, res, next) => {
  try {
    const data = await workOrderService.deleteGroup(req.params.id, req.params.groupId, {
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Group deleted successfully', data });
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const data = await workOrderService.updateItem(req.params.itemId, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
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
      roles: req.user.roles,
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
      roles: req.user.roles,
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
      roles: req.user.roles,
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
      user_id: req.user.id,
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
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order completed', data });
  } catch (err) {
    next(err);
  }
};

const completeProductionTask = async (req, res, next) => {
  try {
    const completed = req.body.completed === undefined ? true : req.body.completed;
    const data = await workOrderService.completeProductionTask(req.params.taskId, {
      completed,
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({
      success: true,
      message: completed ? 'Production item completed' : 'Production item reopened',
      data,
    });
  } catch (err) {
    next(err);
  }
};

const previewWorkOrder = async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'No file uploaded');

    // 1. Parse file only — nothing is written until the user confirms the preview.
    const path = require('path');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fields;
    if (ext === '.docx') {
      fields = await workOrderUploadService.parseWorkOrderDocx(req.file.buffer);
    } else {
      fields = await workOrderUploadService.parseWorkOrderPdf(req.file.buffer);
    }

    if (!fields.wo_number) {
      throw new ApiError(422, 'Could not extract required fields', ['wo_number']);
    }

    // 2. Evaluasi Warnings
    const warnings = [];
    if (!fields.customer) warnings.push('customer');
    if (!fields.model_code) warnings.push('model_code');
    if (!fields.serial_numbers.length) warnings.push('serial_numbers');
    if (!Number.isInteger(fields.revision) || fields.revision < 0) warnings.push('revision');

    // 3. Preview only — nothing is written until the user confirms.
    return res.json({
      success: true,
      message: `${ext === '.docx' ? 'DOCX' : 'PDF'} parsed for preview`,
      extracted: fields,
      warnings,
    });
  } catch (err) {
    next(err);
  }
};

const confirmUploadWorkOrder = async (req, res, next) => {
  try {
    const {
      wo_number,
      revision,
      customer,
      model_code,
      serial_numbers = [],
      customize_with = [],
      overwrite = false,
      revision,
    } = req.body || {};

    if (!wo_number || typeof wo_number !== 'string' || !wo_number.trim()) {
      throw new ApiError(422, 'Work order number is required to import', ['wo_number']);
    }

    // Evaluasi Warnings
    const warnings = [];
    if (!customer) warnings.push('customer');
    if (!model_code) warnings.push('model_code');
    if (!serial_numbers || serial_numbers.length === 0) warnings.push('serial_numbers');

    // Mapping Groups (Model & Serial Numbers)
    const groups = model_code
      ? (serial_numbers && serial_numbers.length
        ? serial_numbers.map((sn) => ({
            machine_model_id: model_code,
            serial_number: sn,
          }))
        : [{ machine_model_id: model_code }])
      : [];

    // Mapping Customize Items (title + quantity, defaulted to 1)
    const items = (customize_with || []).map((item) => ({
      title: item.title,
      quantity: Number.isInteger(item.quantity) && item.quantity >= 1 ? item.quantity : 1,
    }));

    // Existing work orders require an explicit overwrite confirmation.
    const wo = await workOrderService.createWorkOrder({
      wo_number: wo_number.trim(),
      revision,
      customer: customer || null,
      groups,
      items,
      overwrite: overwrite === true,
      created_by: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
      revision: Number.isFinite(Number(revision)) && Number(revision) >= 0 ? Number(revision) : 0,
    });

    const revised = Boolean(wo.revised);
    return res.status(revised ? 200 : 201).json({
      success: true,
      message: revised
        ? `Work order ${wo.wo_number} rewritten to draft`
        : (warnings.length ? 'Work order imported with warnings' : 'Successfully uploaded work order'),
      data: wo,
      warnings,
      extracted: {
        wo_number: wo.wo_number,
        revision: wo.revision,
        model_code,
        serial_numbers,
        customize_with: items,
        customer,
        revision: wo.revision,
      },
    });
  } catch (err) {
    next(err);
  }
};

const listAccess = async (req, res, next) => {
  try {
    const data = await workOrderService.listWorkOrderAccess(req.params.id, {
      user_id: req.user.id,
      roles: req.user.roles,
    });
    res.json({ success: true, message: 'Work order access retrieved', data });
  } catch (err) {
    next(err);
  }
};

const grantAccess = async (req, res, next) => {
  try {
    const data = await workOrderService.grantWorkOrderAccess(req.params.id, {
      user_id: req.user.id,
      roles: req.user.roles,
      target_user_id: req.body.user_id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Access granted', data });
  } catch (err) {
    next(err);
  }
};

const revokeAccess = async (req, res, next) => {
  try {
    const data = await workOrderService.revokeWorkOrderAccess(req.params.id, {
      user_id: req.user.id,
      roles: req.user.roles,
      target_user_id: req.params.userId,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Access revoked', data });
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
  previewWorkOrder,
  confirmUploadWorkOrder,
  update,
  updateNotes,
  addGroup,
  updateGroup,
  deleteGroup,
  addItem,
  updateItem,
  deleteItem,
  analyze,
  finalize,
  startProduction,
  completeProduction,
  completeProductionTask,
  listAccess,
  grantAccess,
  revokeAccess,
};
