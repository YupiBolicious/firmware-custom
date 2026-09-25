const { ApiError } = require('../middleware/errorHandler');

const MAX_CODE = 50;
const MAX_NAME = 200;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

const fail = (next, errors) => {
  if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
  next();
};

const validateModelCreate = (req, res, next) => {
  const { model_code, name, description } = req.body || {};
  const errors = [];

  if (!isNonEmptyString(model_code)) errors.push('model_code is required (non-empty string)');
  else if (model_code.trim().length > MAX_CODE) errors.push(`model_code must be at most ${MAX_CODE} characters`);

  if (!isNonEmptyString(name)) errors.push('name is required (non-empty string)');
  else if (name.trim().length > MAX_NAME) errors.push(`name must be at most ${MAX_NAME} characters`);

  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string or null');
  }

  fail(next, errors);
};

const validateModelUpdate = (req, res, next) => {
  const { model_code, name, description } = req.body || {};
  const errors = [];

  if (model_code !== undefined
      && (!isNonEmptyString(model_code) || model_code.trim().length > MAX_CODE)) {
    errors.push(`model_code must be a non-empty string of max ${MAX_CODE} characters`);
  }
  if (name !== undefined
      && (!isNonEmptyString(name) || name.trim().length > MAX_NAME)) {
    errors.push(`name must be a non-empty string of max ${MAX_NAME} characters`);
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string or null');
  }

  fail(next, errors);
};

const validateVersionCreate = (req, res, next) => {
  const { version_code, description } = req.body || {};
  const errors = [];

  if (!isNonEmptyString(version_code)) errors.push('version_code is required (non-empty string)');
  else if (version_code.trim().length > MAX_CODE) errors.push(`version_code must be at most ${MAX_CODE} characters`);

  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string or null');
  }

  fail(next, errors);
};

const validateVersionUpdate = (req, res, next) => {
  const { version_code, description } = req.body || {};
  const errors = [];

  if (version_code !== undefined
      && (!isNonEmptyString(version_code) || version_code.trim().length > MAX_CODE)) {
    errors.push(`version_code must be a non-empty string of max ${MAX_CODE} characters`);
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    errors.push('description must be a string or null');
  }

  fail(next, errors);
};

module.exports = { validateModelCreate, validateModelUpdate, validateVersionCreate, validateVersionUpdate };
