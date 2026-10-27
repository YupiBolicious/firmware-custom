const workOrderAccessRepository = require('../../repositories/workOrderAccessRepository');
const machineModelRepository = require('../../repositories/machineModelRepository');
const { ApiError } = require('../../middleware/errorHandler');

const LOCKED_STATUSES = ['FINALIZED', 'PRODUCTION', 'READY_TO_CLOSE', 'COMPLETED'];

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

const verifyAssignedCoder = (wo, user_id, roles = []) => {
  if (!roles.includes('CODER')) {
    throw new ApiError(403, 'Only assigned firmware engineer can start the production');
  }
  if (wo.assigned_coder_id == null) {
    throw new ApiError(403, 'A firmware engineer should be assigned to the work order');
  }

  if (Number(wo.assigned_coder_id) !== Number(user_id)) {
    throw new ApiError(403, 'Only assigned firmware engineer can start the production');
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
  assertNotFinalized,
  verifyAssignedCoder,
};
