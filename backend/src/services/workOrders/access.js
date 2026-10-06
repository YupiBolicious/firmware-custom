const workOrderRepository = require('../../repositories/workOrderRepository');
const workOrderAccessRepository = require('../../repositories/workOrderAccessRepository');
const userRepository = require('../../repositories/userRepository');
const auditService = require('../auditService');
const notificationService = require('../notificationService');
const { ApiError } = require('../../middleware/errorHandler');
const { assertCanEditWorkOrder, assertCanManageAccess } = require('./guards');

const listWorkOrderAccess = async (work_order_id, { user_id, roles }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  return workOrderAccessRepository.findGrantedByWorkOrderId(work_order_id);
};

const grantWorkOrderAccess = async (work_order_id, { user_id, target_user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanManageAccess(wo, user_id, roles);
  if (Number(target_user_id) === Number(wo.created_by)) {
    throw new ApiError(400, 'The owner already has access');
  }
  const target = await userRepository.findUserWithRolesById(Number(target_user_id));
  if (!target) {
    throw new ApiError(404, 'User not found');
  }
  const granted = await workOrderAccessRepository.grant(work_order_id, target_user_id, user_id);
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_ACCESS_GRANTED',
    entity_type: 'WORK_ORDER',
    entity_id: work_order_id,
    work_order_id,
    details: { wo_number: wo.wo_number, granted_user_id: target_user_id },
    ip_address,
  });
  notificationService.notify({
    user_id: target_user_id,
    status: 'ACCESS_GRANTED',
    message: `You can now edit ${wo.wo_number}`,
    entity_id: work_order_id,
  });
  if (Number(wo.created_by) !== Number(target_user_id)) {
    notificationService.notify({
      user_id: wo.created_by,
      status: 'ACCESS_GRANTED',
      message: `${target.username} can now edit ${wo.wo_number}`,
      entity_id: work_order_id,
    });
  }
  return granted || { work_order_id, user_id: target_user_id };
};

const revokeWorkOrderAccess = async (work_order_id, { user_id, target_user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanManageAccess(wo, user_id, roles);
  const revoked = await workOrderAccessRepository.revoke(work_order_id, target_user_id);
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_ACCESS_REVOKED',
    entity_type: 'WORK_ORDER',
    entity_id: work_order_id,
    work_order_id,
    details: { wo_number: wo.wo_number, revoked_user_id: target_user_id },
    ip_address,
  });
  if (revoked) {
    const revokedTarget = await userRepository.findUserWithRolesById(Number(target_user_id));
    notificationService.notify({
      user_id: target_user_id,
      status: 'ACCESS_REVOKED',
      message: `Your access to ${wo.wo_number} was revoked`,
      entity_id: work_order_id,
    });
    if (Number(wo.created_by) !== Number(target_user_id)) {
      notificationService.notify({
        user_id: wo.created_by,
        status: 'ACCESS_REVOKED',
        message: `${revokedTarget ? revokedTarget.username : `user id ${target_user_id}`} no longer has access to ${wo.wo_number}`,
        entity_id: work_order_id,
      });
    }
  }
  return revoked;
};

module.exports = {
  listWorkOrderAccess,
  grantWorkOrderAccess,
  revokeWorkOrderAccess,
};