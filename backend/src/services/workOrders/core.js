const workOrderRepository = require('../../repositories/workOrderRepository');
const workOrderResetRepository = require('../../repositories/workOrderResetRepository');
const auditService = require('../auditService');
const notificationRepository = require('../../repositories/notificationRepository');
const classificationService = require('../classificationService');
const kbRepository = require('../../repositories/kbRepository');
const { ApiError } = require('../../middleware/errorHandler');
const { validatePagination, paginatedPayload } = require('../../utils/pagination');
const { resolveGroupTargets, assertCanEditWorkOrder } = require('./guards');

const listWorkOrders = async ({ page = 1, limit = 15 } = {}) => {
  const { page: parsedPage, limit: parsedLimit } = validatePagination(page, limit);
  const res = await workOrderRepository.findAll({ page: parsedPage, limit: parsedLimit });
  return paginatedPayload(res.items.map(({ total, ...rest }) => rest), res.total, parsedPage, parsedLimit);
};

const listCoderReviewQueue = async ({ page = 1, limit = 15 } = {}) => {
  const { page: parsedPage, limit: parsedLimit } = validatePagination(page, limit);
  const res = await workOrderRepository.findCoderReviewQueue({ page: parsedPage, limit: parsedLimit });
  return paginatedPayload(res.items.map(({ total, ...rest }) => rest), res.total, parsedPage, parsedLimit);
};

const getWorkOrder = async (id) => {
  const wo = await workOrderRepository.findById(id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  const productionTasks = await workOrderRepository.findProductionTasksByWorkOrderId(id);
  const groups = await workOrderRepository.findGroupsByWorkOrderId(id);
  const items = await workOrderRepository.findItemsByWorkOrderId(id);
  const kbVersion = await kbRepository.getCorpusVersion();
  const stamped = items.map((item) => ({
    ...item,
    verdict_stale: item.classification_id != null && item.reviewed_by == null && (
      item.input_hash !== classificationService.inputHash(item) ||
      Number(item.kb_version) !== Number(kbVersion)
    ),
  }));
  return { ...wo, groups, items: stamped, production_tasks: productionTasks };
};

const createWorkOrder = async ({ wo_number, customer, created_by, groups, items, ip_address }) => {
  const existing = await workOrderRepository.findByWoNumber(wo_number);
  if (existing) {
    throw new ApiError(409, 'A work order with this number already exists');
  }
  const resolvedGroups = [];
  for (const group of groups || []) {
    const targets = await resolveGroupTargets(group.machine_model_id);
    resolvedGroups.push({ ...targets, serial_number: group.serial_number });
  }
  const wo = await workOrderRepository.createWithGroups({ wo_number, customer, created_by, groups: resolvedGroups, items });
  await auditService.log({
    user_id: created_by,
    action: 'WORK_ORDER_CREATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    work_order_id: wo.id,
    details: { wo_number: wo.wo_number, group_count: wo.groups.length, item_count: (wo.items||[]).length },
    ip_address,
  });
  return wo;
};

const updateWorkOrder = async (id, { title, description, customer, status, user_id, roles, ip_address }) => {
  const existing = await workOrderRepository.findById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(existing, user_id, roles);

  if (status !== undefined && status !== existing.status) {
    const isRollback = status === 'DRAFT' && existing.status === 'ANALYZED';
    if (!isRollback) {
      throw new ApiError(400, 'Status can only be rolled back from ANALYZED to DRAFT via update; use analyze/finalize for other transitions');
    }
  }

  const wo = await workOrderRepository.update(id, { title, description, customer, status });

  if (status === 'DRAFT' && existing.status === 'ANALYZED') {
    await workOrderResetRepository.clearAnalysisByWorkOrderId(id);
    await workOrderRepository.deleteProductionTasksByWorkOrderId(id);
    await notificationRepository.deleteByEntityAndStatus(id, 'CODER_REVIEW');
    await auditService.log({
      user_id,
      action: 'WORK_ORDER_STATUS_ROLLED_BACK',
      entity_type: 'WORK_ORDER',
      entity_id: id,
      work_order_id: id,
      details: { wo_number: existing.wo_number, from: 'ANALYZED', to: 'DRAFT' },
      ip_address,
    });
  }

  await auditService.log({
    user_id,
    action: 'WORK_ORDER_UPDATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    work_order_id: wo.id,
    details: { wo_number: wo.wo_number, changes: { title, description, customer, status } },
    ip_address,
  });
  return wo;
};

const updateWorkOrderNotes = async (id, { notes, user_id, ip_address }) => {
  const existing = await workOrderRepository.findById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order not found');
  }
  const wo = await workOrderRepository.update(id, { notes });
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_NOTE_UPDATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    work_order_id: wo.id,
    details: { wo_number: wo.wo_number },
    ip_address,
  });
  return wo;
};

module.exports = {
  listWorkOrders,
  listCoderReviewQueue,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  updateWorkOrderNotes,
};
