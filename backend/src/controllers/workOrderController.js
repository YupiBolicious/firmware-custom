const workOrderService = require('../services/workOrderService');

const list = async (req, res, next) => {
  try {
    const data = await workOrderService.listWorkOrders();
    res.json({ success: true, message: 'Work orders retrieved', data });
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

module.exports = {
  list,
  getById,
  create,
  update,
  addItem,
  updateItem,
  deleteItem,
  analyze,
  finalize,
};