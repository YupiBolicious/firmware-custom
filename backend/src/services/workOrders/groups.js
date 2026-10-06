const workOrderRepository = require('../../repositories/workOrderRepository');
const auditService = require('../auditService');
const { ApiError } = require('../../middleware/errorHandler');
const { resolveGroupTargets, assertCanEditWorkOrder, assertNotFinalized } = require('./guards');

const addGroup = async (work_order_id, { machine_model_id, serial_number, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertNotFinalized(wo, 'groups');
  const targets = await resolveGroupTargets(machine_model_id);
  const group = await workOrderRepository.createGroup({
    work_order_id,
    machine_model_id: targets.machine_model_id,
    serial_number: typeof serial_number === 'string' && serial_number.trim() ? serial_number.trim() : null,
  });
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_GROUP_ADDED',
    entity_type: 'WORK_ORDER_GROUP',
    entity_id: group.id,
    work_order_id,
    details: { machine_model_id, serial_number: group.serial_number },
    ip_address,
  });
  return group;
};

const updateGroup = async (work_order_id, groupId, { machine_model_id, serial_number, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertNotFinalized(wo, 'groups');
  const targets = await resolveGroupTargets(machine_model_id);
  const group = await workOrderRepository.updateGroup(groupId, work_order_id, {
    machine_model_id: targets.machine_model_id,
    serial_number: typeof serial_number === 'string' && serial_number.trim() ? serial_number.trim() : null,
  });
  if (!group) {
    throw new ApiError(404, 'Work order group not found');
  }
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_GROUP_UPDATED',
    entity_type: 'WORK_ORDER_GROUP',
    entity_id: group.id,
    work_order_id,
    details: { machine_model_id, serial_number: group.serial_number },
    ip_address,
  });
  return group;
};

const deleteGroup = async (work_order_id, groupId, { user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertNotFinalized(wo, 'groups');
  const itemCount = await workOrderRepository.countItemsByGroupId(groupId);
  if (itemCount > 0) {
    throw new ApiError(400, 'Cannot delete a group that still has custom items');
  }
  const deleted = await workOrderRepository.deleteGroup(groupId, work_order_id);
  if (!deleted) {
    throw new ApiError(404, 'Work order group not found');
  }
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_GROUP_DELETED',
    entity_type: 'WORK_ORDER_GROUP',
    entity_id: groupId,
    work_order_id,
    details: {},
    ip_address,
  });
  return deleted;
};

module.exports = {
  addGroup,
  updateGroup,
  deleteGroup,
};