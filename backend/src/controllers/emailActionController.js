const emailActionService = require('../services/emailActionService');

const requestWorkOrder = async (req, res, next) => {
  try {
    const data = await emailActionService.requestWorkOrderFromEmail(req.body?.token, req.ip);
    res.json({
      success: true,
      message: data.already_processed
        ? 'This work order was already requested'
        : data.work_order.status === 'COMPLETED'
          ? 'Work order completed; no firmware production was required'
          : 'Work order requested successfully',
      data: {
        work_order: data.work_order,
        already_processed: data.already_processed,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { requestWorkOrder };
