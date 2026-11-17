const workOrderService = require('../services/workOrderService');

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
    res.json({ success: true, message: 'Access removed', data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
    revokeAccess, listAccess, grantAccess,
};