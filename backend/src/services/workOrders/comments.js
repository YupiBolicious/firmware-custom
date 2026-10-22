const workOrderRepository = require('../../repositories/workOrderRepository');
const workOrderAccessRepository = require('../../repositories/workOrderAccessRepository');
const auditService = require('../auditService');
const notificationService = require('../notificationService');
const { ApiError } = require('../../middleware/errorHandler');

const hasRole = (roles, role) => Array.isArray(roles) && roles.includes(role);

const canReadComments = (wo, userId, roles, accessList) => {
  if (hasRole(roles, 'ADMIN')) return true;
  if (Number(wo.created_by) === Number(userId)) return true;
  if (accessList.some((a) => Number(a.user_id) === Number(userId))) return true;
  if (hasRole(roles, 'CODER')) return true;
  if (hasRole(roles, 'PM')) return true;
  return false;
};

const canAddComment = (wo, userId, roles, accessList) => {
  if (hasRole(roles, 'ADMIN')) return true;
  if (hasRole(roles, 'CODER')) return true;
  if (hasRole(roles, 'PM')) {
    const isOwner = Number(wo.created_by) === Number(userId);
    const isGranted = accessList.some((a) => Number(a.user_id) === Number(userId));
    return isOwner || isGranted;
  }
  return false;
};

const canDeleteComment = (wo, comment, userId, roles) => {
  if (hasRole(roles, 'ADMIN')) return true;
  if (Number(comment.user_id) === Number(userId)) return true;
  return false;
};

const listWorkOrderComments = async (workOrderId, { user_id, roles }) => {
  const wo = await workOrderRepository.findById(workOrderId);
  if (!wo) throw new ApiError(404, 'Work order not found');
  const accessList = await workOrderAccessRepository.findGrantedByWorkOrderId(workOrderId);
  if (!canReadComments(wo, user_id, roles, accessList)) {
    throw new ApiError(403, 'Forbidden');
  }
  return workOrderRepository.findCommentsByWorkOrderId(workOrderId);
};

const addWorkOrderComment = async (workOrderId, { content, user_id, roles, ip_address }) => {
  if (!content || !String(content).trim()) throw new ApiError(400, 'Comment content is required');
  const trimmed = String(content).trim();
  if (trimmed.length > 2000) throw new ApiError(400, 'Comment is too long (max 2000 characters)');
  const wo = await workOrderRepository.findById(workOrderId);
  if (!wo) throw new ApiError(404, 'Work order not found');
  const accessList = await workOrderAccessRepository.findGrantedByWorkOrderId(workOrderId);
  if (!canAddComment(wo, user_id, roles, accessList)) {
    throw new ApiError(403, 'Forbidden');
  }
  const created = await workOrderRepository.createComment({ work_order_id: workOrderId, user_id, content: trimmed });
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_COMMENT_ADDED',
    entity_type: 'WORK_ORDER_COMMENT',
    entity_id: created.id,
    work_order_id: workOrderId,
    details: { wo_number: wo.wo_number },
    ip_address,
  });
  // notify relevant parties (fire-and-forget): owner, users with access, and thread participants
  try {
    const [latestAccessList, comments] = await Promise.all([
      workOrderAccessRepository.findGrantedByWorkOrderId(workOrderId),
      workOrderRepository.findCommentsByWorkOrderId(workOrderId),
    ]);
    const recipients = new Set();
    if (wo.created_by != null) recipients.add(Number(wo.created_by));
    for (const a of latestAccessList || []) {
      if (a.user_id != null) recipients.add(Number(a.user_id));
    }
    for (const c of comments || []) {
      if (c.user_id != null) recipients.add(Number(c.user_id));
    }
    recipients.delete(Number(user_id));
    for (const uid of recipients) {
      notificationService.notify({
        user_id: uid,
        status: 'WORK_ORDER_COMMENT',
        message: `${wo.wo_number}: New comment`,
        entity_id: workOrderId,
      });
    }
  } catch (_) {}
  return created;
};

const deleteWorkOrderComment = async (workOrderId, commentId, { user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(workOrderId);
  if (!wo) throw new ApiError(404, 'Work order not found');
  const comment = await workOrderRepository.findCommentById(commentId);
  if (!comment || Number(comment.work_order_id) !== Number(workOrderId)) throw new ApiError(404, 'Comment not found');
  if (!canDeleteComment(wo, comment, user_id, roles)) throw new ApiError(403, 'Forbidden');
  const deleted = await workOrderRepository.deleteComment(commentId);
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_COMMENT_DELETED',
    entity_type: 'WORK_ORDER_COMMENT',
    entity_id: commentId,
    work_order_id: workOrderId,
    details: { wo_number: wo.wo_number },
    ip_address,
  });
  return deleted;
};

module.exports = {
  listWorkOrderComments,
  addWorkOrderComment,
  deleteWorkOrderComment,
};
