const workOrderService = require('../services/workOrderService');

const startProduction = async (req, res, next) => {
  try {
    const data = await workOrderService.startProduction(req.params.id, {
      user_id: req.user.id,
      roles: req.user.roles,
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
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Work order submitted for admin closure', data });
  } catch (err) {
    next(err);
  }
};

const closeWO =  async(req, res, next) => {
try{
  const data = await workOrderService.closeWO(req.params.id, {
    user_id: req.user.id,
    roles: req.user.roles,
    ip_address: req.ip,
  }); 
  res.json({success: true, message:'Work order Closed', data});
}catch (err) {
  next(err);
}};

const reopenWO = async(req, res, next) => {
  try{
    const data = await workOrderService.reopenWO(req.params.id, {
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    }); 
    res.json({success: true, message:'Work Order Reopen', data});
  }catch(err){
    next(err);
  }
}

const completeProductionTask = async (req, res, next) => {
  try {
    const completed = req.body.completed === undefined ? true : req.body.completed;
    const data = await workOrderService.completeProductionTask(req.params.taskId, {
      completed,
      user_id: req.user.id,
      roles: req.user.roles,
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

module.exports = {
    startProduction, completeProduction, closeWO, reopenWO, completeProductionTask,
};