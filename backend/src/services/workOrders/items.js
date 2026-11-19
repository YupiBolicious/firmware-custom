const workOrderRepository = require('../../repositories/workOrderRepository');
const woItemRepository = require('../../repositories/woItemRepository');
const classificationRepository = require('../../repositories/classificationRepository');
const notificationRepository = require('../../repositories/notificationRepository');
const lifecycle = require('./lifecycle');

const auditService = require('../auditService');
const { ApiError } = require('../../middleware/errorHandler');
const { capitalizeWords } = require('../../utils/textUtils');
const { assertCanEditWorkOrder, assertNotFinalized } = require('./guards');

// ponytail: numbering is WO-scoped; a WO holds one model and its SNs, items are not per-SN.
// ponytail: legacy rows carry an i-prefix (i1, i3), so digits anywhere in the string count
// toward max. New items use plain numbers (1, 2, ... 10); sorting is lexicographic.
const generateItemNumber = async (work_order_id) => {
  const numbers = await workOrderRepository.findItemNumbersByWorkOrderId(work_order_id);
  let max = 0;
  for (const value of numbers) {
    for (const digits of String(value).match(/\d+/g) || []) {
      const parsed = parseInt(digits, 10);
      if (parsed > max) {
        max = parsed;
      }
    }
  }
  const next = max + 1;
  return String(next);
};

const addItem = async (work_order_id, { work_order_group_id, item_number, title, description, quantity, documentation_readiness, user_id, roles, ip_address }) => {
  const wo = await workOrderRepository.findById(work_order_id);
  if (!wo) {
    throw new ApiError(404, 'Work order not found');
  }
  await assertCanEditWorkOrder(wo, user_id, roles);
  assertNotFinalized(wo, 'items');

  // Custom items are WO-level: a group is optional legacy context, never required.
  if (work_order_group_id != null) {
    const group = await workOrderRepository.findGroupById(work_order_group_id, work_order_id);
    if (!group) {
      throw new ApiError(404, 'Work order group not found');
    }
  }
  const item = await woItemRepository.createItem({
    work_order_id,
    work_order_group_id: work_order_group_id ?? null,
    item_number: await generateItemNumber(work_order_id),
    title: capitalizeWords(title),
    quantity,
    documentation_readiness,
  });

  await auditService.log({
    user_id,
    action: 'ITEM_ADDED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    work_order_id,
    details: { work_order_group_id, item_number: item.item_number, title: item.title },
    ip_address,
  });
  await lifecycle.analyzeQuietly(work_order_id, { user_id, roles, ip_address });
  return item;
};

const updateItem = async (id, { title, description, quantity, documentation_readiness, user_id, roles, ip_address }) => {
  const existing = await woItemRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }

  const parent = await workOrderRepository.findById(existing.work_order_id);
  await assertCanEditWorkOrder(parent || { id: existing.work_order_id, created_by: null }, user_id, roles);
  assertNotFinalized(parent, 'items');
  const textChanged = (title !== undefined && title !== existing.title)
    || (documentation_readiness !== undefined && documentation_readiness !== null
        && documentation_readiness !== existing.documentation_readiness);
  const item = await woItemRepository.updateItem(id, {
    title: title !== undefined ? capitalizeWords(title) : title,
    quantity,
    documentation_readiness,
  });
  const workOrderStatus = parent ? parent.status : null;
  await auditService.log({
    user_id,
    action: 'ITEM_UPDATED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: item.id,
    work_order_id: item.work_order_id,
    details: { item_number: item.item_number, changes: { title, quantity, documentation_readiness } },
    ip_address,
  });
  await lifecycle.analyzeQuietly(existing.work_order_id, { user_id, roles, ip_address });
  return { ...item, work_order_status: workOrderStatus, text_changed: textChanged };
};

const deleteItem = async (id, { user_id, roles, ip_address }) => {
  const existing = await woItemRepository.findItemById(id);
  if (!existing) {
    throw new ApiError(404, 'Work order item not found');
  }
  const parent = await workOrderRepository.findById(existing.work_order_id);
  await assertCanEditWorkOrder(parent || { id: existing.work_order_id, created_by: null }, user_id, roles);
  assertNotFinalized(parent, 'items');
  await woItemRepository.deleteItem(id);
  const remainingItems = await woItemRepository.countItemsByWorkOrderId(existing.work_order_id);
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
  if (remainingItems > 0) {
    await lifecycle.analyzeQuietly(existing.work_order_id, { user_id, roles, ip_address });
  }
  return { id };
};

module.exports = {
  addItem,
  updateItem,
  deleteItem,
};