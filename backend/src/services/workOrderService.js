const workOrderRepository = require('../repositories/workOrderRepository');
const classificationRepository = require('../repositories/classificationRepository');
const estimationRepository = require('../repositories/estimationRepository');
const classificationService = require('./classificationService');
const estimationService = require('./estimationService');
const auditService = require('./auditService');
const { ApiError } = require('../middleware/errorHandler');

// ---------- Work Orders ----------
const listWorkOrders = async () => {
  return workOrderRepository.findAll();
};

const listCoderReviewQueue = async () => {
  return workOrderRepository.findCoderReviewQueue();
};

const reviewItem = async (itemId, { complexity_level_id, notes, user_id, ip_address }) => {
  const item = await workOrderRepository.findItemWithWorkOrder(itemId);
  if (!item) {
    throw new ApiError(404, 'Work order item not found');
  }
  if (item.work_order_status === 'FINALIZED') {
    throw new ApiError(400, 'Finalized work orders cannot be reviewed');
  }

  const level = await estimationRepository.findComplexityLevelById(complexity_level_id);
  if (!level || !/^L[0-5]$/.test(level.code)) {
    throw new ApiError(400, 'complexity_level_id must reference an active L0-L5 level');
  }

  const classification = await classificationRepository.findByItemId(itemId);
  if (!classification || classification.status !== 'CODER_REVIEW') {
    throw new ApiError(400, 'Item is not awaiting coder review');
  }

  const isFirmware = level.code !== 'L0';
  const reason = notes?.trim()
    ? `Coder review: ${notes.trim()}`
    : `Coder review confirmed ${level.code} (${level.name})`;
  const saved = await classificationRepository.reviewClassification({
    work_order_item_id: itemId,
    fw_related: isFirmware,
    complexity_level_id: level.id,
    classification_reason: reason,
    reviewed_by: user_id,
  });
  if (!saved) {
    throw new ApiError(409, 'Item review was already completed; reload the queue');
  }

  await estimationService.createOrUpdateEstimation({
    work_order_item_id: itemId,
    complexity_level_id: isFirmware ? level.id : null,
  });

  await auditService.log({
    user_id,
    action: 'ITEM_REVIEWED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: itemId,
    details: { work_order_id: item.work_order_id, complexity_code: level.code, fw_related: isFirmware },
    ip_address,
  });

  return { ...saved, complexity_code: level.code, complexity_name: level.name, estimated_hours: isFirmware ? Number(level.total_hours) : null };
};

const getWorkOrder = async (id) => {
  const wo = await workOrderRepository.findById(id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  const productionTasks = await workOrderRepository.findProductionTasksByWorkOrderId(id);
  const items = await workOrderRepository.findItemsByWorkOrderId(id);
  return { ...wo, items, production_tasks: productionTasks };
};

const createWorkOrder = async ({ wo_number, title, description, customer, created_by, ip_address }) => {
  const wo = await workOrderRepository.create({ wo_number, title, description, customer, created_by });
  await auditService.log({
    user_id: created_by,
    action: 'WORK_ORDER_CREATED',
    entity_type: 'WORK_ORDER',
    entity_id: wo.id,
    details: { wo_number: wo.wo_number, title: wo.title },
    ip_address,
  });
  return wo;
};

const updateWorkOrder = async (id, { title, description, customer, status, user_id, ip_address }) => {
  const existing = await workOrderRepository.findById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order not found');
  }
  const wo = await workOrderRepository.update(id, { title, description, customer, status });
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

// ---------- Items ----------
const addItem = async (work_order_id, { item_number, title, description, quantity, user_id, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  const item = await workOrderRepository.createItem({ work_order_id, item_number, title, description, quantity });
  await auditService.log({
    user_id,
    action: 'ITEM_ADDED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    details: { work_order_id, item_number: item.item_number, title: item.title },
    ip_address,
  });
  return item;
};

const updateItem = async (id, { title, description, quantity, user_id, ip_address }) => {
  const existing = await workOrderRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }
  const item = await workOrderRepository.updateItem(id, { title, description, quantity });
  await auditService.log({
    user_id,
    action: 'ITEM_UPDATED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    details: { work_order_id: item.work_order_id, item_number: item.item_number, changes: { title, description, quantity } },
    ip_address,
  });
  return item;
};

const deleteItem = async (id, { user_id, ip_address }) => {
  const existing = await workOrderRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }
  await workOrderRepository.deleteItem(id);
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

// ---------- Analyze ----------
/**
 * Analyze all items in a work order:
 * 1. Classify each item (exact → rule → unknown)
 * 2. Persist classification
 * 3. Create/update estimation for firmware items
 * 4. Return per-item results + summary
 */
const analyzeWorkOrder = async (work_order_id, { user_id, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }

  const items = await workOrderRepository.findItemsByWorkOrderId(work_order_id);
  if (items.length === 0) {
    throw new ApiError(400, 'Work order has no items to analyze');
  }

  const results = [];
  for (const item of items) {
    const classification = item.reviewed_by
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
      : await classificationService.classifyItem(item);

    // Persist classification
    const saved = await classificationRepository.upsertClassification({
      work_order_item_id: item.id,
      fw_related: classification.fw_related,
      complexity_level_id: classification.complexity_level_id,
      classification_method: classification.classification_method,
      confidence_score: classification.confidence_score,
      classification_reason: classification.classification_reason,
      status: classification.status,
    });

    // Record match for traceability
    if (classification.kb_item_id || classification.rule_id) {
      await classificationRepository.createMatch({
        classification_id: saved.id,
        kb_item_id: classification.kb_item_id || null,
        rule_id: classification.rule_id || null,
        match_type: classification.classification_method === 'EXACT_MATCH' ? 'EXACT' : 'RULE',
        match_score: classification.match_score,
      });
    }

    // Create/update estimation for firmware items
    let estimation = null;
    let complexityCode = null;
    if (classification.fw_related === true && classification.complexity_level_id) {
      estimation = await estimationService.createOrUpdateEstimation({
        work_order_item_id: item.id,
        complexity_level_id: classification.complexity_level_id,
      });
      const level = await estimationRepository.findComplexityLevelById(classification.complexity_level_id);
      complexityCode = level ? level.code : null;
    } else if (classification.fw_related === false) {
      // Non-firmware → ensure no estimation exists
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
      estimated_hours: estimation ? Number(estimation.total_hours) : null,
    });
  }

  // Update work order status to ANALYZED
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

  return { work_order: { ...wo, status: 'ANALYZED' }, results, summary };
};

const finalizeWorkOrder = async (work_order_id, { user_id, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
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

module.exports = {
  listWorkOrders,
  listCoderReviewQueue,
  reviewItem,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  addItem,
  updateItem,
  deleteItem,
  analyzeWorkOrder,
  finalizeWorkOrder,
};