const workOrderRepository = require('../repositories/workOrderRepository');
const workOrderResetRepository = require('../repositories/workOrderResetRepository');
const workOrderAccessRepository = require('../repositories/workOrderAccessRepository');
const userRepository = require('../repositories/userRepository');
const machineModelRepository = require('../repositories/machineModelRepository');
const classificationRepository = require('../repositories/classificationRepository');
const complexityRepository = require('../repositories/complexityRepository');
const classificationService = require('../services/classificationService');
const classifyFlow = require('../services/classifyFlow');
const telemetry = require('../services/classifyTelemetry');
const kbCache = require('../services/kbCache');
const kbRepository = require('../repositories/kbRepository');
const estimationRepository = require('../repositories/estimationRepository');
const estimationService = require('../services/estimationService');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');
const notificationRepository = require('../repositories/notificationRepository');
const { ApiError } = require('../middleware/errorHandler');

const { reviewItem } = require('./reviewService');
// const { uploadDocuments, listDocuments, deleteDocument } = require('./documentService');
//const documentRepository = require('../repositories/documentRepository');
const { capitalizeWords } = require('../utils/textUtils');
const { deriveReviewReason, pickPrimaryBlockedReason } = require('./semanticAssist');

// ---------- Work Orders ----------
const { validatePagination, paginatedPayload } = require('../utils/pagination');

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

const createWorkOrder = async ({ wo_number, description, customer, created_by, groups, items, ip_address }) => {
  const existing = await workOrderRepository.findByWoNumber(wo_number);
  if (existing) {
    throw new ApiError(409, 'A work order with this number already exists');
  }
  const resolvedGroups = [];
  for (const group of groups || []) {
    const targets = await resolveGroupTargets(group.machine_model_id);
    resolvedGroups.push({ ...targets, serial_number: group.serial_number });
  }
  const wo = await workOrderRepository.createWithGroups({ wo_number, description, customer, created_by, groups: resolvedGroups, items });
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

// ---------- Groups ----------
const assertGroupsEditable = (wo) => {
  if (['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status)) {
    throw new ApiError(400, 'Work order groups cannot be modified after finalization');
  }
};

const addGroup = async (work_order_id, { machine_model_id, serial_number, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertGroupsEditable(wo);
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
  assertGroupsEditable(wo);
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
    work_order_id,
    details: {},
    ip_address,
  });
  return deleted;
};

// ---------- Items ----------
// ponytail: numbering is WO-scoped; a WO holds one model and its SNs, items are not per-SN.
const generateItemNumber = async (work_order_id) => {
  const numbers = await workOrderRepository.findItemNumbersByWorkOrderId(work_order_id);
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

const addItem = async (work_order_id, { work_order_group_id, item_number, title, description, quantity, documentation_readiness, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertItemsEditable(wo);

  // Custom items are WO-level: a group is optional legacy context, never required.
  if (work_order_group_id != null) {
    const group = await workOrderRepository.findGroupById(work_order_group_id, work_order_id);
    if (!group) {
      throw new ApiError(404, 'Work order group not found');
    }
  }
  const item = await workOrderRepository.createItem({
    work_order_id,
    work_order_group_id: work_order_group_id ?? null,
    item_number: await generateItemNumber(work_order_id),
    title: capitalizeWords(title),
    description: description ? capitalizeWords(description) : description,
    quantity,
    documentation_readiness,
  });

  if (wo.status === 'ANALYZED') {
    await workOrderRepository.update(work_order_id, { status: 'DRAFT' });
  }
  await auditService.log({
    user_id,
    action: 'ITEM_ADDED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    work_order_id,
    details: { work_order_group_id, item_number: item.item_number, title: item.title },
    ip_address,
  });
  return item;
};

const updateItem = async (id, { title, description, quantity, documentation_readiness, user_id, roles, ip_address }) => {
  const existing = await workOrderRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }

  const parent = await workOrderRepository.findById(existing.work_order_id);
  await assertCanEditWorkOrder(parent || { id: existing.work_order_id, created_by: null }, user_id, roles);
  assertItemsEditable(parent);
  const textChanged = (title !== undefined && title !== existing.title)
    || (description !== undefined && (description || null) !== (existing.description || null))
    || (documentation_readiness !== undefined && documentation_readiness !== null
        && documentation_readiness !== existing.documentation_readiness);
  const item = await workOrderRepository.updateItem(id, {
    title: title !== undefined ? capitalizeWords(title) : title,
    description: description !== undefined && description !== null ? capitalizeWords(description) : description,
    quantity,
    documentation_readiness,
  });
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
    work_order_id: item.work_order_id,
    details: { item_number: item.item_number, changes: { title, description, quantity, documentation_readiness } },
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
        work_order_id: existing.work_order_id,
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
    work_order_id: existing.work_order_id,
    details: { item_number: existing.item_number },
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

  const tItemsQuery = Date.now();
  const items = await workOrderRepository.findItemsByWorkOrderId(work_order_id);
  const itemsQueryMs = Date.now() - tItemsQuery;
  if (items.length === 0) {
    throw new ApiError(400, 'Work order has no items to analyze');
  }
  //blocker button analyzed
  if (['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status)) {
  throw new ApiError(400, 'Only draft or analyzed work orders can be analyzed');
}

  const results = [];
  const newlyInReview = [];
  const tAnalyze = Date.now();
  const prepared = await kbCache.getPreparedKb();
  const refs = {
    kbItems: prepared.rows,
    rules: await classificationRepository.findAllRules(),
  };
  const kbVersion = prepared.version;
  const kbById = new Map(prepared.rows.map((r) => [r.id, r]));
  const perf = {
    kbRows: prepared.rowCount,
    kbCandidates: prepared.rows.length,
    kbCacheHit: prepared.cacheHit,
    kbQueryMs: prepared.queryMs,
    kbPrepMs: prepared.prepMs,
    itemsQueryMs,
    itemsTotal: items.length,
    itemsScored: 0,
    scoreMs: 0,
    semanticMs: 0,
    semanticHits: 0,
    writeMs: 0,
  };
  const levels = await complexityRepository.findAll();
  const levelById = new Map(levels.filter((l) => l.is_active !== false).map((l) => [l.id, l]));
  const l0Level = await estimationRepository.findComplexityLevelByCode('L0');
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
        machine_model_code: item.machine_model_code || null,
        machine_model_version: item.machine_model_version || null,
        serial_number: item.serial_number || null,
        fw_related: item.fw_related,
        complexity_level_id: item.complexity_level_id,
        complexity_code: item.complexity_code || 0,
        classification_method: item.classification_method,
        confidence_score: item.confidence_score != null ? Number(item.confidence_score) : null,
        classification_reason: item.classification_reason,
        status: item.classification_status,
        estimated_hours: item.estimated_hours != null ? Number(item.estimated_hours) : null,
        assist_kb_code: item.assist_kb_code || null,
        assist_match_score: item.assist_match_score != null ? Math.round(Number(item.assist_match_score) * 100) : null,
        assist_semantic_margin: item.assist_semantic_margin != null ? Number(item.assist_semantic_margin) : null,
        review_reason: item.review_reason || null,
        assist_blocked_reason: item.assist_blocked_reason || null,
        estimation_breakdown: item.estimation_total_hours != null ? {
          verification_mh: Number(item.verification_mh) || 0,
          other_mh: Number(item.estimation_total_hours)
            - (Number(item.verification_mh) || 0),
          total_hours: Number(item.estimation_total_hours),
        } : null,
        quantity: item.quantity,
      });
      continue;
    }
    const hash = classificationService.inputHash(item);
    const reusable = item.classification_id != null
      && item.input_hash === hash
      && Number(item.kb_version) === Number(kbVersion);
    let classification;
    let itemSemantic = null;
    let itemAssist = null;
    let flowed = null;
    if (reusable) {
      classification = {
        fw_related: item.fw_related,
        complexity_level_id: item.complexity_level_id,
        classification_method: item.classification_method,
        confidence_score: item.confidence_score != null ? Number(item.confidence_score) : null,
        classification_reason: item.classification_reason,
        status: item.classification_status,
        kb_item_id: null,
        rule_id: null,
      };
    } else {
      const tScore = Date.now();
      flowed = await classifyFlow.classifyFlow(item, refs);
      classification = flowed.result;
      itemSemantic = flowed.semantic;
      itemAssist = flowed.assist || null;
      perf.scoreMs += Date.now() - tScore;
      perf.itemsScored++;
      if (flowed.semantic) {
        perf.semanticMs += flowed.semantic.totalMs || 0;
        perf.semanticHits++;
      }
    }

    if (classification.status === 'CODER_REVIEW' && item.classification_status !== 'CODER_REVIEW') {
      newlyInReview.push(item);
    }

    if (classification.fw_related === false && !classification.complexity_level_id && l0Level) {
      classification.complexity_level_id = l0Level.id;
    }

    // (semantic.assistBlocked.reasons); priority is enforced in
    // deriveReviewReason (mismatch > low score > no candidate).
    const assistBlockedReasons = itemSemantic && itemSemantic.assistBlocked && itemSemantic.assistBlocked.reasons
      ? itemSemantic.assistBlocked.reasons
      : null;
    const reviewReason = classification.status === 'CODER_REVIEW'
      ? deriveReviewReason({ assist: itemAssist, assistBlockedReasons })
      : null;
    const assistBlockedReason = classification.status === 'CODER_REVIEW'
      ? pickPrimaryBlockedReason(assistBlockedReasons)
      : null;

    const tWrite = Date.now();
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
      assist: itemAssist,
      preserveAssist: reusable,
      review_reason: reviewReason,
      assist_blocked_reason: assistBlockedReason,
    });

    await classificationRepository.deleteMatchesByClassificationId(saved.id);
    if (classification.kb_item_id || classification.rule_id) {
      const matchType =
        classification.classification_method === 'EXACT_MATCH' ? 'EXACT'
        : classification.classification_method === 'LEXICAL_SIMILARITY' ? 'EXACT'
        : classification.classification_method === 'SIMILARITY'
        || classification.classification_method === 'SEMANTIC_CLASSIFICATION' ? 'SIMILARITY'
        : 'RULE';
      await classificationRepository.createMatch({
        classification_id: saved.id,
        kb_item_id: classification.kb_item_id || null,
        rule_id: classification.rule_id || null,
        match_type: matchType,
        match_score: classification.match_score,
      });
    }

    if (flowed) {
      await auditService.log({
        user_id,
        action: telemetry.DECIDED_ACTION,
        entity_type: 'WORK_ORDER_ITEM',
        entity_id: item.id,
        work_order_id,
        details: telemetry.buildDecidedDetails({
          path: flowed.path,
          result: classification,
          semantic: itemSemantic,
          assist: itemAssist,
          lexical: flowed.lexical,
          decisionBlocked: flowed.decisionBlocked,
          classificationId: saved.id,
          kbVersion,
          kbById,
        }),
        ip_address,
      });
    }

    let estimation = null;
    let complexityCode = null;
    if (classification.complexity_level_id) {
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
    perf.writeMs += Date.now() - tWrite;

    results.push({
      item_id: item.id,
      item_number: item.item_number,
      title: item.title,
      machine_model_code: item.machine_model_code || null,
      machine_model_version: item.machine_model_version || null,
      serial_number: item.serial_number || null,
      fw_related: classification.fw_related,
      complexity_level_id: classification.complexity_level_id,
      complexity_code: complexityCode,
      classification_method: classification.classification_method,
      confidence_score: classification.confidence_score,
      classification_reason: classification.classification_reason,
      status: classification.status,
      estimated_hours: estimation && estimation.breakdown
        ? Number(estimation.breakdown.verification_mh)
          + Number(estimation.breakdown.other_mh) * (item.quantity || 1)
        : null,
      provisional_hours: classification.status === 'CODER_REVIEW' && saved.assist_complexity_level_id != null
        ? (Number(levelById.get(saved.assist_complexity_level_id)?.total_hours) || 0) * (item.quantity || 1)
        : null,
      assist_complexity_code: classification.status === 'CODER_REVIEW' && saved.assist_complexity_level_id != null
        ? (levelById.get(saved.assist_complexity_level_id)?.code || null)
        : null,
      // assist_match_score is 0-100 here for frontend display ONLY. The persisted
      // database value (saved.assist_match_score / semantic_suggestion.match_score)
      // stays the original 0-1 score — never scale what is stored.
      assist_kb_code: saved.assist_kb_code || null,
      assist_match_score: saved.assist_match_score != null ? Math.round(Number(saved.assist_match_score) * 100) : null,
      assist_semantic_margin: saved.assist_semantic_margin != null ? Number(saved.assist_semantic_margin) : null,
      assist_kb_title: saved.assist_kb_id != null ? (kbById.get(Number(saved.assist_kb_id))?.title || null) : null,
      review_reason: saved.review_reason || null,
      assist_blocked_reason: saved.assist_blocked_reason || null,
      semantic: itemSemantic,
      semantic_suggestion: itemAssist,
      estimation_breakdown: estimation && estimation.breakdown ? {
        verification_mh: Number(estimation.breakdown.verification_mh),
        other_mh: Number(estimation.breakdown.other_mh),
        total_hours: Number(estimation.breakdown.total_hours),
      } : null,
      quantity: item.quantity,
    });
  }

  await workOrderRepository.update(work_order_id, { status: 'ANALYZED' });

  await auditService.log({
    user_id,
    action: 'WORK_ORDER_ANALYZED',
    entity_type: 'WORK_ORDER',
    entity_id: work_order_id,
    work_order_id,
    // Slim payload: per-item statuses already live in per-item rows + classifications table
    details: { item_count: items.length, newly_in_review: newlyInReview.length },
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

  return { work_order: { ...wo, status: 'ANALYZED' }, results, summary, perf: { ...perf, totalMs: Date.now() - tAnalyze } };
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
    work_order_id: finalized.id,
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
const startProduction = async (id, { user_id, ip_address }) => {
  const wo = await workOrderRepository.findById(id);
  if (!wo) throw new ApiError(404, 'Work order not found');
  if (wo.status !== 'FINALIZED') throw new ApiError(400, 'Work order must be FINALIZED to start production');
  const updated = await workOrderRepository.updateStatus(id, 'PRODUCTION', 'FINALIZED');
  if (!updated) throw new ApiError(409, 'Work order state changed; reload and try again');
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_PRODUCTION',
    entity_type: 'WORK_ORDER',
    entity_id: id,
    work_order_id: id,
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
  if (!saved) {
    throw new ApiError(409, 'Work order is no longer in production');
  }
  await auditService.log({
    user_id,
    action: completed ? 'PRODUCTION_TASK_COMPLETED' : 'PRODUCTION_TASK_REOPENED',
    entity_type: 'PRODUCTION_TASK',
    entity_id: taskId,
    work_order_id: task.work_order_id,
    details: {
      wo_number: wo.wo_number,
      task_code: task.task_code,
      work_order_item_id: task.work_order_item_id,
    },
    ip_address,
  });
  return saved;
};

const completeProduction = async (id, { user_id, ip_address }) => {
  const wo = await workOrderRepository.findById(id);
  if (!wo) throw new ApiError(404, 'Work order not found');
  if (wo.status !== 'PRODUCTION') throw new ApiError(400, 'Work order must be in PRODUCTION to complete');
  const { total, open } = await workOrderRepository.countProductionTasksByWorkOrderId(id);
  // ponytail: count-check + status flip are not atomic; a task toggle committed between them
  // can leave a COMPLETED WO with an open task. Microsecond window, needs a single tx with
  // SELECT ... FOR UPDATE on the work_orders row to close, upgrade if it ever bites.
  if (open > 0) {
    throw new ApiError(400, `All production items must be completed first (${open} of ${total} still open)`);
  }
  const updated = await workOrderRepository.updateStatus(id, 'COMPLETED', 'PRODUCTION');
  if (!updated) throw new ApiError(409, 'Work order state changed; reload and try again');
  await auditService.log({
    user_id,
    action: 'WORK_ORDER_COMPLETED',
    entity_type: 'WORK_ORDER',
    entity_id: id,
    work_order_id: id,
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
  listWorkOrders,
  listCoderReviewQueue,
  reviewItem,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  updateWorkOrderNotes,
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
  // uploadDocuments,
  // listDocuments,
  // deleteDocument,
  listWorkOrderAccess,
  grantWorkOrderAccess,
  revokeWorkOrderAccess,
};
