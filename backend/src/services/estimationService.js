const estimationRepository = require('../repositories/estimationRepository');
const workOrderRepository = require('../repositories/workOrderRepository');

const READINESS_MISSING = 'MISSING';

const resolveVerification = async (complexityLevelId, readiness) => {
  if (!complexityLevelId) return null;
  if (readiness === READINESS_MISSING) {
    return estimationRepository.findVerificationByCode('V3');
  }
  return estimationRepository.findVerificationByComplexityId(complexityLevelId);
};

const createOrUpdateEstimation = async ({ work_order_item_id, complexity_level_id }) => {
  if (!complexity_level_id) {
    await estimationRepository.deleteByItemId(work_order_item_id);
    return null;
  }

  const level = await estimationRepository.findComplexityLevelById(complexity_level_id);
  if (!level) {
    throw new Error(`Complexity level ${complexity_level_id} not found or inactive`);
  }
  const item = await workOrderRepository.findItemById(work_order_item_id);
  const verification = await resolveVerification(level.id, item ? item.documentation_readiness : null);

  const verificationMh = verification ? Number(verification.verification_mh) : 0;
  const otherMh = Number(level.total_hours);
  const total = verificationMh + otherMh;

  const saved = await estimationRepository.upsertEstimation({
    work_order_item_id,
    complexity_level_id: level.id,
    requirement_review_h: level.requirement_review_h,
    code_development_h: level.code_development_h,
    peer_review_fixing_h: level.peer_review_fixing_h,
    bench_testing_h: level.bench_testing_h,
    unit_testing_h: level.unit_testing_h,
    verification_mh: verificationMh,
    total_hours: total,
  });

  return {
    ...saved,
    verification_code: verification ? verification.code : null,
    breakdown: {
      verification_mh: verificationMh,
      other_mh: otherMh,
      total_hours: total,
    },
  };
};

module.exports = { createOrUpdateEstimation, resolveVerification, READINESS_MISSING };
