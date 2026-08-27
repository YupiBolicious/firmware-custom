const workOrderRepository = require('../repositories/workOrderRepository');
const classificationRepository = require('../repositories/classificationRepository');
const estimationRepository = require('../repositories/estimationRepository');
const estimationService = require('../services/estimationService');
const kbRepository = require('../repositories/kbRepository');
const auditService = require('../services/auditService');
const { ApiError } = require('../middleware/errorHandler');
const { buildKeywords } = require('../utils/textUtils');

const reviewItem = async (itemId, { complexity_level_id, notes, keywords, user_id, ip_address }) => {
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

  const learnedKbItem = await kbRepository.upsertCoderLearning({
    item_id: item.id,
    title: item.title,
    description: item.description,
    fw_related: isFirmware,
    complexity_level_id: isFirmware ? level.id : null,
    keywords: buildKeywords(item.title, item.description, keywords),
  });

  await auditService.log({
    user_id,
    action: 'ITEM_REVIEWED',
    entity_type: 'WORK_ORDER_ITEM',
    entity_id: itemId,
    details: { work_order_id: item.work_order_id, complexity_code: level.code, fw_related: isFirmware },
    ip_address,
  });

  return {
    ...saved,
    complexity_code: level.code,
    complexity_name: level.name,
    estimated_hours: isFirmware ? Number(level.total_hours) * (item.quantity || 1) : null,
    learned_kb_code: learnedKbItem.kb_code,
  };
};

module.exports = { reviewItem };
