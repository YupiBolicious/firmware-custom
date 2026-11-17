const workOrderService = require('../services/workOrderService');

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
//item on coder review
const reviewItem = async (req, res, next) => {
  try {
    const data = await workOrderService.reviewItem(req.params.itemId, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Item review confirmed', data });
  } catch (err) {
    next(err);
  }
};

const correctReviewedItem = async (req, res, next) => {
  try {
    const data = await workOrderService.correctReviewedItem(req.params.itemId, {
      ...req.body,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Coder decision corrected', data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
    addItem, updateItem, deleteItem, reviewItem, correctReviewedItem,
};