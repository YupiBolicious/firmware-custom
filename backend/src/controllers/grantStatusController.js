const workOrderService = require('../services/workOrderService');

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

const assignCoder = async(req, res, next) => {
 try {
    const data = await workOrderService.assignWorkOrderCoder(req.params.id, {
      coder_id: req.body.coder_id,
      user_id: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order assignment updated', data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
    adminChangeStatus, assignCoder,
};
