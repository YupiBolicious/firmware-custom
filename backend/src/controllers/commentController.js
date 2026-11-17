const workOrderService = require('../services/workOrderService');

const listComments = async (req, res, next) => {
  try {
    const data = await workOrderService.listWorkOrderComments(req.params.id, {
      user_id: req.user.id,
      roles: req.user.roles,
    });
    res.json({ success: true, message: 'Comments retrieved', data });
  } catch (err) {
    next(err);
  }
};

const createComment = async (req, res, next) => {
  try {
    const data = await workOrderService.addWorkOrderComment(req.params.id, {
      content: req.body.content,
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'Comment added', data });
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const data = await workOrderService.deleteWorkOrderComment(req.params.id, req.params.commentId, {
      user_id: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Comment deleted', data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
    listComments, createComment, deleteComment,
};