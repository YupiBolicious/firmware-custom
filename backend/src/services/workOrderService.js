const workOrderRepository = require('../repositories/workOrderRepository');
const workOrderResetRepository = require('../repositories/workOrderResetRepository');
const workOrderAccessRepository = require('../repositories/workOrderAccessRepository');
const userRepository = require('../repositories/userRepository');
const machineModelRepository = require('../repositories/machineModelRepository');
const classificationRepository = require('../repositories/classificationRepository');
const classificationService = require('../services/classificationService');
const kbRepository = require('../repositories/kbRepository');
const estimationRepository = require('../repositories/estimationRepository');
const estimationService = require('../services/estimationService');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');
const notificationRepository = require('../repositories/notificationRepository');
const { ApiError } = require('../middleware/errorHandler');

const { reviewItem } = require('./reviewService');
const { uploadDocuments, listDocuments, deleteDocument } = require('./documentService');

// ---------- Work Orders ----------
const resolveGroupTargets = async (machine_model_id, machine_model_version_id) => {
  let modelId;
  if (Number.isInteger(machine_model_id)) {
    modelId = machine_model_id;
  } else {
    const model = await machineModelRepository.findOrCreateByCode(machine_model_id.trim());
    modelId = model.id;
  }
  let versionId;
  if (machine_model_version_id === undefined || machine_model_version_id === null
      || (typeof machine_model_version_id === 'string' && machine_model_version_id.trim() === '')) {
    versionId = null;
  } else if (Number.isInteger(machine_model_version_id)) {
    versionId = machine_model_version_id;
  } else {
    const version = await machineModelRepository.findOrCreateVersion(modelId, machine_model_version_id.trim());
    versionId = version.id;
  }
  return { machine_model_id: modelId, machine_model_version_id: versionId };
};

const listWorkOrders = async () => {
  return workOrderRepository.findAll();
};

const listCoderReviewQueue = async () => {
  return workOrderRepository.findCoderReviewQueue();
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

const createWorkOrder = async ({ wo_number, title, description, customer, created_by, groups, ip_address }) => {
  const existing = await workOrderRepository.findByWoNumber(wo_number);
  if (existing) {
    throw new ApiError(409, 'A work order with this number already exists');
  }
  const resolvedGroups = [];
  for (const group of groups || []) {
    const targets = await resolveGroupTargets(group.machine_model_id, group.machine_model_version_id);
    resolvedGroups.push({ ...targets, serial_number: group.serial_number });
  }
  const wo = await workOrderRepository.createWithGroups({ wo_number, title, description, customer, created_by, groups: resolvedGroups });
  await auditService.log({
    user_id: created_by,
    action: 'WORK_ORDER_CREATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    details: { wo_number: wo.wo_number, title: wo.title, group_count: wo.groups.length },
    ip_address,
  });
  return wo;
};

// ---------- Access Control ----------
const assertCanEditWorkOrder = async (wo, user_id, roles) => {
  const userRoles = roles || [];
  if (userRoles.includes('ADMIN')) return;
  if (wo.created_by === Number(user_id)) return;
  const granted = await workOrderAccessRepository.hasAccess(wo.id, user_id);
  if (granted) return;
  throw new ApiError(403, 'You do not have permission to edit this work order');
};

const assertCanManageAccess = async (wo, user_id, roles) => {
  const userRoles = roles || [];
  if (userRoles.includes('ADMIN')) return;
  if (wo.created_by === Number(user_id)) return;
  throw new ApiError(403, 'Only the owner or an administrator can manage access');
};

const notifyWorkOrderRecipients = async ({ work_order_id, wo_number, owner_id, status, message }) => {
  const granteeIds = await workOrderAccessRepository.findUserIdsByWorkOrderId(work_order_id);
   const [admins, coders] = await Promise.all([
    userRepository.findAllByRole('ADMIN'),
    userRepository.findAllByRole('CODER'),
  ]);
  const recipientIds = new Set([
    owner_id,
    ...granteeIds,
    ...admins.map((u) => u.id),
    ...coders.map((u) => u.id),
  ]);
  for (const uid of recipientIds) {
    if (uid == null) continue;
    notificationService.notify({ user_id: uid, status, message, entity_id: work_order_id });
  }
};
//   const recipientIds = new Set([owner_id, ...granteeIds]);
//   for (const uid of recipientIds) {
//     if (uid == null) continue;
//     notificationService.notify({ user_id: uid, status, message, entity_id: work_order_id });
//   }
// };

const notifyCodersOfReview = async ({ work_order_id, wo_number, message }) => {
  const [admins, coders] = await Promise.all([
    userRepository.findAllByRole('ADMIN'),
    userRepository.findAllByRole('CODER'),
  ]);
  const recipientIds = new Set([...admins.map((u) => u.id), ...coders.map((u) => u.id)]);
  for (const uid of recipientIds) {
    if (uid == null) continue;
    notificationService.notify({ user_id: uid, status: 'CODER_REVIEW', message, entity_id: work_order_id });
  }
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
      details: { wo_number: existing.wo_number, from: 'ANALYZED', to: 'DRAFT' },
      ip_address,
    });
  }

  await auditService.log({
    user_id,
    action: 'WORK_ORDER_UPDATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    details: { wo_number: wo.wo_number, changes: { title, description, customer, status } },
    ip_address,
  });
  return wo;
};

// ---------- Groups ----------
const assertGroupsEditable = (wo) => {
  if (['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status)) {
    throw new ApiError(400, 'Work order groups cannot be modified after finalization');
  }
};

const addGroup = async (work_order_id, { machine_model_id, machine_model_version_id, serial_number, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertGroupsEditable(wo);
  const targets = await resolveGroupTargets(machine_model_id, machine_model_version_id);
  const group = await workOrderRepository.createGroup({
    work_order_id,
    machine_model_id: targets.machine_model_id,
    machine_model_version_id: targets.machine_model_version_id,
    serial_number: typeof serial_number === 'string' && serial_number.trim() ? serial_number.trim() : null,
  });
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_GROUP_ADDED',
    entity_type: 'WORK_ORDER_GROUP',
    entity_id: group.id,
    details: { work_order_id, machine_model_id, machine_model_version_id, serial_number: group.serial_number },
    ip_address,
  });
  return group;
};

const updateGroup = async (work_order_id, groupId, { machine_model_id, machine_model_version_id, serial_number, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertGroupsEditable(wo);
  const targets = await resolveGroupTargets(machine_model_id, machine_model_version_id);
  const group = await workOrderRepository.updateGroup(groupId, work_order_id, {
    machine_model_id: targets.machine_model_id,
    machine_model_version_id: targets.machine_model_version_id,
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
    details: { work_order_id, machine_model_id, machine_model_version_id, serial_number: group.serial_number },
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
  assertGroupsEditable(wo);
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
    details: { work_order_id },
    ip_address,
  });
  return deleted;
};

// ---------- Items ----------
const generateItemNumber = async (work_order_group_id) => {
  const numbers = await workOrderRepository.findItemNumbersByGroupId(work_order_group_id);
  let max = 0;
  for (const value of numbers) {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > max) {
      max = parsed;
    }
  }
  const next = max + 1;
  return next > 99 ? String(next) : String(next).padStart(2, '0');
};

//block server side if status not draft or analyzed 
const assertItemsEditable = (wo) => {
  if (['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status)) {
    throw new ApiError(400, 'Work order items cannot be modified after finalization');
  }
};

const addItem = async (work_order_id, { work_order_group_id, item_number, title, description, quantity, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertItemsEditable(wo);

  const group = await workOrderRepository.findGroupById(work_order_group_id, work_order_id);
  if (!group) {
    throw new ApiError(404, 'Work order group not found');
  }
  const item = await workOrderRepository.createItem({
    work_order_id,
    work_order_group_id,
    item_number: await generateItemNumber(work_order_group_id),
    title,
    description,
    quantity,
  });

  if (wo.status === 'ANALYZED') {
    await workOrderRepository.update(work_order_id, { status: 'DRAFT' });
  }
  await auditService.log({
    user_id,
    action: 'ITEM_ADDED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    details: { work_order_id, work_order_group_id, item_number: item.item_number, title: item.title },
    ip_address,
  });
  return item;
};

const updateItem = async (id, { title, description, quantity, user_id, roles, ip_address }) => {
  const existing = await workOrderRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }

  const parent = await workOrderRepository.findById(existing.work_order_id);
  await assertCanEditWorkOrder(parent || { id: existing.work_order_id, created_by: null }, user_id, roles);
  assertItemsEditable(parent);
  const textChanged = (title !== undefined && title !== existing.title)
    || (description !== undefined && (description || null) !== (existing.description || null));
  const item = await workOrderRepository.updateItem(id, { title, description, quantity });
  let workOrderStatus = parent ? parent.status : null;
  if (textChanged && parent && parent.status === 'ANALYZED') {
    await workOrderRepository.update(existing.work_order_id, { status: 'DRAFT' });
    workOrderStatus = 'DRAFT';
  }
  await auditService.log({
    user_id,
    action: 'ITEM_UPDATED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    details: { work_order_id: item.work_order_id, item_number: item.item_number, changes: { title, description, quantity } },
    ip_address,
  });
  return { ...item, work_order_status: workOrderStatus, text_changed: textChanged };
};

const deleteItem = async (id, { user_id, roles, ip_address }) => {
  const existing = await workOrderRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }
  const parent = await workOrderRepository.findById(existing.work_order_id);
  await assertCanEditWorkOrder(parent || { id: existing.work_order_id, created_by: null }, user_id, roles);
  assertItemsEditable(parent);
  await workOrderRepository.deleteItem(id);
  const remainingItems = await workOrderRepository.countItemsByWorkOrderId(existing.work_order_id);
  if (remainingItems === 0) {
    if (parent && parent.status !== 'FINALIZED' && parent.status !== 'DRAFT') {
      await workOrderRepository.update(existing.work_order_id, { status: 'DRAFT' });
      await workOrderRepository.deleteProductionTasksByWorkOrderId(existing.work_order_id);
      await auditService.log({
        user_id,
        action: 'WORK_ORDER_RESET_TO_DRAFT',
        entity_type: 'WORK_ORDER',
        entity_id: existing.work_order_id,
        details: { reason: 'Last custom item deleted' },
        ip_address,
      });
    }
  }
  const remainingReview = await classificationRepository.countReviewItemsByWorkOrderId(existing.work_order_id);
  if (remainingReview === 0) {
    await notificationRepository.deleteByEntityAndStatus(existing.work_order_id, 'CODER_REVIEW');
  }
  await auditService.log({
    user_id,
    action: 'ITEM_DELETED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: id,
    details: { work_order_id: existing.work_order_id, item_number: existing.item_number },
    ip_address,
  });
  return { id };
};

// ---------- Analyze & Finalize ----------
const analyzeWorkOrder = async (work_order_id, { user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);

  const items = await workOrderRepository.findItemsByWorkOrderId(work_order_id);
  if (items.length === 0) {
    throw new ApiError(400, 'Work order has no items to analyze');
  }
  //blocker button analyzed
  if (['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status)) {
  throw new ApiError(400, 'Only draft or analyzed work orders can be analyzed');
}

  const results = [];
  const newlyInReview = [];
  const refs = {
    kbItems: await classificationRepository.findAllKbItems(),
    rules: await classificationRepository.findAllRules(),
  };
  const kbVersion = await kbRepository.getCorpusVersion();
  const levels = await estimationRepository.findAllLevels?.() ?? [];
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const levelOf = async (id) => {
    if (id == null) return null;
    if (!levelById.has(id)) {
      levelById.set(id, await estimationRepository.findComplexityLevelById(id));
    }
    return levelById.get(id);
  };
  for (const item of items) {
    if (item.reviewed_by) {
      results.push({
        item_id: item.id,
        item_number: item.item_number,
        title: item.title,
        fw_related: item.fw_related,
        complexity_level_id: item.complexity_level_id,
        complexity_code: item.complexity_code,
        classification_method: item.classification_method,
        confidence_score: item.confidence_score,
        classification_reason: item.classification_reason,
        status: item.classification_status,
        estimated_hours: item.estimated_hours != null ? Number(item.estimated_hours) : null,
        quantity: item.quantity,
      });
      continue;
    }
    const hash = classificationService.inputHash(item);
    const reusable = item.classification_id != null
      && item.input_hash === hash
      && Number(item.kb_version) === Number(kbVersion);
    const classification = reusable
      ? {
        fw_related: item.fw_related,
        complexity_level_id: item.complexity_level_id,
        classification_method: item.classification_method,
        confidence_score: item.confidence_score,
        classification_reason: item.classification_reason,
        status: item.classification_status,
        kb_item_id: null,
        rule_id: null,
      }
      : await classificationService.classifyItem(item, refs);

    if (classification.status === 'CODER_REVIEW' && item.classification_status !== 'CODER_REVIEW') {
      newlyInReview.push(item);
    }

    const saved = await classificationRepository.upsertClassification({
      work_order_item_id: item.id,
      fw_related: classification.fw_related,
      complexity_level_id: classification.complexity_level_id,
      classification_method: classification.classification_method,
      confidence_score: classification.confidence_score,
      classification_reason: classification.classification_reason,
      status: classification.status,
      input_hash: hash,
      kb_version: kbVersion,
    });

    await classificationRepository.deleteMatchesByClassificationId(saved.id);
    if (classification.kb_item_id || classification.rule_id) {
      const matchType =
        classification.classification_method === 'EXACT_MATCH' ? 'EXACT'
        : classification.classification_method === 'SIMILARITY' ? 'SIMILARITY'
        : 'RULE';
      await classificationRepository.createMatch({
        classification_id: saved.id,
        kb_item_id: classification.kb_item_id || null,
        rule_id: classification.rule_id || null,
        match_type: matchType,
        match_score: classification.match_score,
      });
    }

    let estimation = null;
    let complexityCode = null;
    if (classification.fw_related === true && classification.complexity_level_id) {
      estimation = await estimationService.createOrUpdateEstimation({
        work_order_item_id: item.id,
        complexity_level_id: classification.complexity_level_id,
      });
      const level = await levelOf(classification.complexity_level_id);
      complexityCode = level ? level.code : null;
    } else if (classification.fw_related === false) {
      await estimationService.createOrUpdateEstimation({
        work_order_item_id: item.id,
        complexity_level_id: null,
      });
    }

    results.push({
      item_id: item.id,
      item_number: item.item_number,
      title: item.title,
      fw_related: classification.fw_related,
      complexity_level_id: classification.complexity_level_id,
      complexity_code: complexityCode,
      classification_method: classification.classification_method,
      confidence_score: classification.confidence_score,
      classification_reason: classification.classification_reason,
      status: classification.status,
      estimated_hours: estimation ? Number(estimation.total_hours) * (item.quantity || 1) : null,
      quantity: item.quantity,
    });
  }

  await workOrderRepository.update(work_order_id, { status: 'ANALYZED' });

  await auditService.log({
    user_id,
    action: 'WORK_ORDER_ANALYZED',
    entity_type: 'WORK_ORDER',
    entity_id: work_order_id,
    details: { item_count: items.length, results: results.map((r) => ({ item_number: r.item_number, status: r.status })) },
    ip_address,
  });

  const summary = buildSummary(results);

  if (newlyInReview.length > 0) {
    await notifyCodersOfReview({
      work_order_id,
      wo_number: wo.wo_number,
      message: `${newlyInReview.length} item in ${wo.wo_number} need coder review`,
    });
  }

  return { work_order: { ...wo, status: 'ANALYZED' }, results, summary };
};

const finalizeWorkOrder = async (work_order_id, { user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  if (wo.status === 'FINALIZED') {
    return {
      work_order: wo,
      production_tasks: await workOrderRepository.findProductionTasksByWorkOrderId(work_order_id),
    };
  }
  if (wo.status !== 'ANALYZED') {
    throw new ApiError(400, 'Only analyzed work orders can be finalized');
  }

  const items = await workOrderRepository.findItemsByWorkOrderId(work_order_id);
  if (items.length === 0) {
    throw new ApiError(400, 'Work order has no items to finalize');
  }

  const unresolvedItems = items.filter((item) => (
    item.classification_status === 'CODER_REVIEW' || item.fw_related === null
  ));
  if (unresolvedItems.length > 0) {
    throw new ApiError(400, 'Work order has items awaiting coder review', unresolvedItems.map((item) => item.item_number));
  }

  let finalized;
  let productionTasks;
  try {
    ({ workOrder: finalized, productionTasks } = await workOrderRepository.finalizeWithProductionTasks(work_order_id));
  } catch (err) {
    if (err.message === 'Work order is no longer in ANALYZED state') {
      throw new ApiError(409, 'Work order state changed; reload and try again');
    }
    throw err;
  }
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_FINALIZED',
    entity_type: 'WORK_ORDER',
    entity_id: finalized.id,
    details: {
      wo_number: finalized.wo_number,
      item_count: items.length,
      production_task_count: productionTasks.length,
    },
    ip_address,
  });
  await notifyWorkOrderRecipients({
    work_order_id: finalized.id,
    wo_number: finalized.wo_number,
    owner_id: finalized.created_by,
    status: 'WO_FINALIZED',
    message: `${finalized.wo_number} has been finalized`,
  });

  return { work_order: finalized, production_tasks: productionTasks };
};

const buildSummary = (results) => {
  const totalItems = results.length;
  const firmwareItems = results.filter((r) => r.fw_related === true).length;
  const nonFirmwareItems = results.filter((r) => r.fw_related === false).length;
  const waitingReview = results.filter((r) => r.status === 'CODER_REVIEW').length;
  const totalEstimatedHours = results.reduce((sum, r) => sum + (r.estimated_hours || 0), 0);

  return {
    total_items: totalItems,
    firmware_items: firmwareItems,
    non_firmware_items: nonFirmwareItems,
    waiting_review: waitingReview,
    total_estimated_hours: totalEstimatedHours,
  };
};

// ---------- Production ----------
const startProduction = async (id, { ip_address }) => {
  const wo = await workOrderRepository.findById(id);
  if (!wo) throw new ApiError(404, 'Work order not found');
  if (wo.status !== 'FINALIZED') throw new ApiError(400, 'Work order must be FINALIZED to start production');
  const updated = await workOrderRepository.updateStatus(id, 'PRODUCTION');
  await auditService.log({
    user_id: null,
    action: 'WORK_ORDER_PRODUCTION',
    entity_type: 'WORK_ORDER',
    entity_id: id,
    details: { wo_number: wo.wo_number, title: wo.title },
    ip_address,
  });
  return updated;
};

const completeProductionTask = async (taskId, { completed, user_id, ip_address }) => {
  const task = await workOrderRepository.findProductionTaskById(taskId);
  if (!task) throw new ApiError(404, 'Production task not found');
  const wo = await workOrderRepository.findById(task.work_order_id);
  if (!wo) throw new ApiError(404, 'Work order not found');
  if (wo.status !== 'PRODUCTION') {
    throw new ApiError(400, 'Work order must be in production to update tasks');
  }
  const saved = await workOrderRepository.completeProductionTask(taskId, completed);
  await auditService.log({
    user_id,
    action: completed ? 'PRODUCTION_TASK_COMPLETED' : 'PRODUCTION_TASK_REOPENED',
    entity_type: 'PRODUCTION_TASK',
    entity_id: taskId,
    details: {
      work_order_id: task.work_order_id,
      wo_number: wo.wo_number,
      task_code: task.task_code,
      work_order_item_id: task.work_order_item_id,
    },
    ip_address,
  });
  return saved;
};

const completeProduction = async (id, { ip_address }) => {
  const wo = await workOrderRepository.findById(id);
  if (!wo) throw new ApiError(404, 'Work order not found');
  if (wo.status !== 'PRODUCTION') throw new ApiError(400, 'Work order must be in PRODUCTION to complete');
  const { total, open } = await workOrderRepository.countProductionTasksByWorkOrderId(id);
  if (open > 0) {
    throw new ApiError(400, `All production items must be completed first (${open} of ${total} still open)`);
  }
  const updated = await workOrderRepository.updateStatus(id, 'COMPLETED');
  await auditService.log({
    user_id: null,
    action: 'WORK_ORDER_COMPLETED',
    entity_type: 'WORK_ORDER',
    entity_id: id,
    details: { wo_number: wo.wo_number, title: wo.title },
    ip_address,
  });
  await notifyWorkOrderRecipients({
    work_order_id: id,
    wo_number: wo.wo_number,
    owner_id: wo.created_by,
    status: 'WO_COMPLETED',
    message: `${wo.wo_number} has been completed`,
  });
  return updated;
};

// ---------- Access Management ----------
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
  listWorkOrders,
  listCoderReviewQueue,
  reviewItem,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  addGroup,
  updateGroup,
  deleteGroup,
  addItem,
  updateItem,
  deleteItem,
  analyzeWorkOrder,
  finalizeWorkOrder,
  startProduction,
  completeProduction,
  completeProductionTask,
  uploadDocuments,
  listDocuments,
  deleteDocument,
  listWorkOrderAccess,
  grantWorkOrderAccess,
  revokeWorkOrderAccess,
};
