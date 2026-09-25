const { ApiError } = require('../middleware/errorHandler');

const MAX_CODE = 50;
const MAX_TITLE = 300;
const MAX_SOURCE = 30;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

const collectErrors = (body, requireCore) => {
  const b = body || {};
  const errors = [];

  if (requireCore) {
    if (!isNonEmptyString(b.kb_code)) errors.push('kb_code is required (non-empty string)');
    if (!isNonEmptyString(b.title)) errors.push('title is required (non-empty string)');
    if (typeof b.fw_related !== 'boolean') errors.push('fw_related is required (boolean)');
  } else {
    if (b.kb_code !== undefined && !isNonEmptyString(b.kb_code)) errors.push('kb_code must be a non-empty string');
    if (b.title !== undefined && !isNonEmptyString(b.title)) errors.push('title must be a non-empty string');
    if (b.fw_related !== undefined && typeof b.fw_related !== 'boolean') errors.push('fw_related must be a boolean');
  }

  if (isNonEmptyString(b.kb_code) && b.kb_code.trim().length > MAX_CODE) {
    errors.push(`kb_code must be at most ${MAX_CODE} characters`);
  }
  if (isNonEmptyString(b.title) && b.title.trim().length > MAX_TITLE) {
    errors.push(`title must be at most ${MAX_TITLE} characters`);
  }
  if (b.confidence_score !== undefined && b.confidence_score !== null) {
    if (typeof b.confidence_score !== 'number' || !Number.isFinite(b.confidence_score)
        || b.confidence_score < 0 || b.confidence_score > 100) {
      errors.push('confidence_score must be a number between 0 and 100');
    }
  }
  if (b.complexity_level_id !== undefined && b.complexity_level_id !== null && !Number.isInteger(b.complexity_level_id)) {
    errors.push('complexity_level_id must be an integer or null');
  }
  if (b.is_active !== undefined && typeof b.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }
  if (b.description !== undefined && b.description !== null && typeof b.description !== 'string') {
    errors.push('description must be a string or null');
  }
  if (b.keywords !== undefined && b.keywords !== null && typeof b.keywords !== 'string') {
    errors.push('keywords must be a string or null');
  }
  if (b.source !== undefined && b.source !== null
      && (!isNonEmptyString(b.source) || b.source.length > MAX_SOURCE)) {
    errors.push(`source must be a non-empty string of max ${MAX_SOURCE} characters`);
  }

  return errors;
};

const validateKbCreate = (req, res, next) => {
  const errors = collectErrors(req.body, true);
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  next();
};

const validateKbUpdate = (req, res, next) => {
  const body = req.body || {};
  const errors = collectErrors(body, false);
  if (Object.keys(body).length === 0) {
    errors.push('At least one field is required to update');
  }
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  next();
};

module.exports = { validateKbCreate, validateKbUpdate };
