const estimationRepository = require('../repositories/estimationRepository');

/**
 * Create or update the estimation for a firmware-related item.
 * Reads fixed hours from complexity_levels (single source of truth).
 * Returns the estimation record, or null if no complexity level is assigned.
 */
const createOrUpdateEstimation = async ({ work_order_item_id, complexity_level_id }) => {
  if (!complexity_level_id) {
    // Non-firmware or unassigned → no estimation
    await estimationRepository.deleteByItemId(work_order_item_id);
    return null;
  }

  const level = await estimationRepository.findComplexityLevelById(complexity_level_id);
  if (!level) {
    throw new Error(`Complexity level ${complexity_level_id} not found or inactive`);
  }

  return estimationRepository.upsertEstimation({
    work_order_item_id,
    complexity_level_id: level.id,
    requirement_review_h: level.requirement_review_h,
    code_development_h: level.code_development_h,
    peer_review_fixing_h: level.peer_review_fixing_h,
    bench_testing_h: level.bench_testing_h,
    unit_testing_h: level.unit_testing_h,
    total_hours: level.total_hours,
  });
};

module.exports = { createOrUpdateEstimation };