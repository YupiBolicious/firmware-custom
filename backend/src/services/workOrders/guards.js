const workOrderAccessRepository = require('../../repositories/workOrderAccessRepository');
const machineModelRepository = require('../../repositories/machineModelRepository');
const { ApiError } = require('../../middleware/errorHandler');

const LOCKED_STATUSES = ['FINALIZED', 'PRODUCTION', 'COMPLETED'];

const resolveGroupTargets = async (machine_model_id) => {
  let modelId;
  if (Number.isInteger(machine_model_id)) {
    modelId = machine_model_id;
  } else {
    const model = await machineModelRepository.findOrCreateByCode(machine_model_id.trim());
    modelId = model.id;
  }
  return { machine_model_id: modelId };
};

const assertCanEditWorkOrder = async (wo, user_id, roles) => {
  const userRoles = roles || [];
  if (userRoles.includes('ADMIN')) return;
  if (wo.created_by === Number(user_id)) return;
  const granted = await workOrderAccessRepository.hasAccess(wo.id, user_id);
  if (granted) return;
  throw new ApiError(403, 'You do not have permission to edit this work order', [], { code: 'WO_FORBIDDEN' });
};

const assertCanManageAccess = async (wo, user_id, roles) => {
  const userRoles = roles || [];
  if (userRoles.includes('ADMIN')) return;
  if (wo.created_by === Number(user_id)) return;
  throw new ApiError(403, 'Only the owner or an administrator can manage access');
};

// change to assignment granted by task manager/admin
const assertCoderAssignment = async (wo, user_id, roles) => {
  const userRoles = roles || [];
  if (userRoles.includes('ADMIN')) return wo;
  if (!userRoles.includes('CODER')) return wo;
  if (wo.assigned_coder_id == null) {
    const workOrderRepository = require('../../repositories/workOrderRepository');
    const assigned = await workOrderRepository.assignCoderIfUnassigned(wo.id, user_id);
    if (assigned) wo.assigned_coder_id = assigned.assigned_coder_id;
    if (Number(wo.assigned_coder_id) !== Number(user_id)) {
      throw new ApiError(403, 'This work order is assigned to another coder');
    }
    return wo;
  }
  if (Number(wo.assigned_coder_id) !== Number(user_id)) {
    throw new ApiError(403, 'This work order is assigned to another coder');
  }
  return wo;
};

const assertNotFinalized = (wo, subject) => {
  if (LOCKED_STATUSES.includes(wo.status)) {
    throw new ApiError(400, `Work order ${subject} cannot be modified after finalization`);
  }
};

module.exports = {
  resolveGroupTargets,
  assertCanEditWorkOrder,
  assertCanManageAccess,
  assertCoderAssignment,
  assertNotFinalized,
};