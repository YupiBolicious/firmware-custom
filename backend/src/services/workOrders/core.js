const workOrderRepository = require('../../repositories/workOrderRepository');
const workOrderResetRepository = require('../../repositories/workOrderResetRepository');
const auditService = require('../auditService');
const notificationRepository = require('../../repositories/notificationRepository');
const classificationService = require('../classificationService');
const kbRepository = require('../../repositories/kbRepository');
const { ApiError } = require('../../middleware/errorHandler');
const { validatePagination, paginatedPayload } = require('../../utils/pagination');
const { resolveGroupTargets, assertCanEditWorkOrder } = require('./guards');

const listWorkOrders = async ({ page = 1, limit = 15, search = '', status = '' } = {}) => {
  const { page: parsedPage, limit: parsedLimit } = validatePagination(page, limit);
  const res = await workOrderRepository.findAll({
    page: parsedPage,
    limit: parsedLimit,
    search: typeof search === 'string' ? search.slice(0, 100) : '',
    status: typeof status === 'string' ? status : '',
  });
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

const resolveGroupTargetsAll = async (groups) => {
  const resolved = [];
  for (const group of groups || []) {
    const targets = await resolveGroupTargets(group.machine_model_id);
    resolved.push({ ...targets, serial_number: group.serial_number });
  }
  return resolved;
};

const createWorkOrder = async ({ wo_number, customer, created_by, groups, items, revision = 0, overwrite = false, roles = [], ip_address }) => {
  if (revision !== null && revision !== undefined && (!Number.isInteger(revision) || revision < 0)) {
    throw new ApiError(422, 'Work order revision must be a non-negative integer', ['revision']);
  }
  const hasRevision = Number.isInteger(revision) && revision >= 0;
  const normalizedRevision = hasRevision ? revision : 0;

  const existing = await workOrderRepository.findByWoNumber(wo_number);
  if (existing) {
    // Do not offer duplicate/overwrite actions to users who cannot edit this WO.
    await assertCanEditWorkOrder(existing, created_by, roles);

    if (!overwrite) {
      throw new ApiError(
        409,
        `Work order ${existing.wo_number} already exists at revision ${existing.revision}`,
        [],
        {
          code: 'WO_DUPLICATE',
          existing_work_order_id: existing.id,
          existing_wo_number: existing.wo_number,
          existing_revision: existing.revision,
          existing_status: existing.status,
        }
      );
    }

    if (!hasRevision) {
      throw new ApiError(422, 'Could not determine the uploaded work order revision', ['revision']);
    }
    if (normalizedRevision <= Number(existing.revision)) {
      throw new ApiError(
        409,
        `Uploaded revision ${normalizedRevision} must be newer than current revision ${existing.revision}`,
        [],
        {
          code: 'WO_REVISION_NOT_NEWER',
          uploaded_revision: normalizedRevision,
          existing_revision: Number(existing.revision),
        }
      );
    }

    const wo = await workOrderRepository.reviseWithGroups({
      id: existing.id,
      customer,
      groups: await resolveGroupTargetsAll(groups),
      items,
      revision: normalizedRevision,
    });
    await auditService.log({
      user_id: created_by,
      action: 'WORK_ORDER_REVISED',
      entity_type: 'WORK_ORDER',
      entity_id: wo.id,
      work_order_id: wo.id,
      details: {
        wo_number: wo.wo_number,
        revision: { from: wo.previous_revision, to: wo.revision },
        group_count: wo.groups.length,
        item_count: (wo.items || []).length,
      },
      ip_address,
    });
    return { ...wo, revised: true };
  }

  const wo = await workOrderRepository.createWithGroups({
    wo_number,
    customer,
    created_by,
    groups: await resolveGroupTargetsAll(groups),
    items,
    revision: normalizedRevision,
  });
  await auditService.log({
    user_id: created_by,
    action: 'WORK_ORDER_CREATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    work_order_id: wo.id,
    details: { wo_number: wo.wo_number, revision: wo.revision, group_count: wo.groups.length, item_count: (wo.items||[]).length },
    ip_address,
  });
  return { ...wo, revised: false };
};

const updateWorkOrder = async (id, { title, customer, status, user_id, roles, ip_address }) => {
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

  const wo = await workOrderRepository.update(id, { title, customer, status });

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
