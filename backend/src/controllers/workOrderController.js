const workOrderService = require('../services/workOrderService');
const { ApiError } = require('../middleware/errorHandler');

const list = async (req, res, next) => {
  try {
    const data = await workOrderService.listWorkOrders({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      status: req.query.status,
      machineModelCode: req.query.machine_model_code,
      complexity: req.query.complexity,
      classificationStatus: req.query.classification_status,
      from: req.query.from,
      to: req.query.to,
    });
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

const pendingReview = async (req, res, next) => {
  try {
    const data = await workOrderService.listPendingReviewQueue({ page: req.query.page, limit: req.query.limit });
    res.json({ success: true, message: 'Pending review queue retrieved', data });
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

const adminChangeStatus = async (req, res, next) => {
  try {
    const data = await workOrderService.adminChangeWorkOrderStatus(req.params.id, req.body?.status, {
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order status updated', data });
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
    res.json({
      success: true,
      message: data.work_order.status === 'COMPLETED'
        ? 'Work order completed; no firmware production was required'
        : 'Work order finalized successfully',
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list,
  reviewQueue,
  pendingReview,
  getById,
  create,
  update,
  updateNotes,
  addGroup,
  updateGroup,
  deleteGroup,
  analyze,
  finalize,
};