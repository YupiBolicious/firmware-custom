export const REVIEW_REASON_LABELS = {
  NO_EXACT_OR_RULE_MATCH: 'Requires confirmation',
  SEMANTIC_CANDIDATE_LOW_QUALITY: 'Low confidence',
  NO_USABLE_SEMANTIC_CANDIDATE: 'No usable match found',
  CODE_MODEL_MISMATCH: 'Code/model mismatch',
};

export const BLOCK_REASON_LABELS = {
  MODEL_CODE_MISMATCH: 'Code/model mismatch',
  VERSION_MISMATCH: 'Code/model mismatch',
  SERIAL_MISMATCH: 'Code/model mismatch',
  MEASUREMENT_MISMATCH: 'Code/model mismatch',
  SCORE_BELOW_FLOOR: 'Candidate below quality floor',
  NO_SEMANTIC_CANDIDATE: 'No usable match found',
  ROW_UNRESOLVED: 'Item source unavailable',
};

export const reviewReasonLabel = (code) =>
  code ? REVIEW_REASON_LABELS[code] || code : null;

export const blockReasonLabel = (code) =>
  code ? BLOCK_REASON_LABELS[code] || code : null;