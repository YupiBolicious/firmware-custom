const { ApiError } = require('../middleware/errorHandler');

const isModelValue = (value) => {
  if (Number.isInteger(value)) return value >= 1;
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 50;
};

const validateWorkOrderCreate = (req, res, next) => {
  const { wo_number, customer, groups, items } = req.body || {};
  const errors = [];

  if (!wo_number || typeof wo_number !== 'string' || !wo_number.trim()) {
    errors.push('wo_number is required');
  }
  // if (description !== undefined && typeof description !== 'string') {
  //   errors.push('description must be a string');
  // }
  if (!customer || typeof customer !== 'string' || !customer.trim()) {
    errors.push('customer is required');
  }
  if (!Array.isArray(groups) || groups.length === 0) {
    errors.push('groups is required (at least one Model group)');
  } else {
    groups.forEach((group, index) => {
      if (!group || !isModelValue(group.machine_model_id)) {
        errors.push(`groups[${index}].machine_model_id is required (id or model code)`);
      }
      if (group && group.serial_number !== undefined && group.serial_number !== null
          && (typeof group.serial_number !== 'string' || group.serial_number.length > 100)) {
        errors.push(`groups[${index}].serial_number must be a string of max 100 characters`);
      }
    });
  }
  if (items !== undefined && !Array.isArray(items)) {
    errors.push('items must be an array');
  } else if (Array.isArray(items)) {
    items.forEach((item, index) => {
      if (!item || typeof item.title !== 'string' || !item.title.trim()) {
        errors.push(`items[${index}].title is required`);
      }
      if (item && item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1)) {
        errors.push(`items[${index}].quantity must be a positive integer`);
      }
      if (item && item.documentation_readiness !== undefined && item.documentation_readiness !== null
          && !['READY', 'MISSING'].includes(item.documentation_readiness)) {
        errors.push(`items[${index}].documentation_readiness must be READY or MISSING`);
      }
    });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateWorkOrderUpdate = (req, res, next) => {
  const { title, customer, status } = req.body || {};
  const errors = [];

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    errors.push('title must be a non-empty string');
  }
  if (status !== undefined && !['DRAFT', 'ANALYZED', 'FINALIZED'].includes(status)) {
    errors.push('status must be one of DRAFT, ANALYZED, FINALIZED');
  }
  // if (description !== undefined && typeof description !== 'string') {
  //   errors.push('description must be a string');
  // }
  if (customer !== undefined && typeof customer !== 'string') {
    errors.push('customer must be a string');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateGroupCreate = (req, res, next) => {
  const { machine_model_id, serial_number } = req.body || {};
  const errors = [];

  if (!isModelValue(machine_model_id)) {
    errors.push('machine_model_id is required (id or model code)');
  }
  if (serial_number !== undefined && serial_number !== null
      && (typeof serial_number !== 'string' || serial_number.length > 100)) {
    errors.push('serial_number must be a string of max 100 characters');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateGroupUpdate = validateGroupCreate;

const validateItemCreate = (req, res, next) => {
  const { title, quantity, documentation_readiness } = req.body || {};
  const errors = [];

  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('title is required');
  }
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
    errors.push('quantity must be a positive integer');
  }
  if (documentation_readiness !== undefined && documentation_readiness !== null
      && !['READY', 'MISSING'].includes(documentation_readiness)) {
    errors.push('documentation_readiness must be READY or MISSING');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateItemUpdate = (req, res, next) => {
  const { title, description, quantity, documentation_readiness } = req.body || {};
  const errors = [];

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    errors.push('title must be a non-empty string');
  }
  if (description !== undefined && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
    errors.push('quantity must be a positive integer');
  }
  if (documentation_readiness !== undefined && documentation_readiness !== null
      && !['READY', 'MISSING'].includes(documentation_readiness)) {
    errors.push('documentation_readiness must be READY or MISSING');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateReview = (req, res, next) => {
  const { complexity_level_id, keywords, notes, semantic_assist_response } = req.body || {};
  const errors = [];

  if (!Number.isInteger(complexity_level_id)) {
    errors.push('complexity_level_id is required');
  }
  if (keywords !== undefined && (typeof keywords !== 'string' || keywords.length > 500)) {
    errors.push('keywords must be a string of max 500 characters');
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    errors.push('notes must be a string');
  }
  if (semantic_assist_response !== undefined && !['ACCEPTED', 'IGNORED'].includes(semantic_assist_response)) {
    errors.push('semantic_assist_response must be ACCEPTED or IGNORED');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateProductionTaskUpdate = (req, res, next) => {
  const { completed } = req.body || {};
  const errors = [];

  if (completed !== undefined && typeof completed !== 'boolean') {
    errors.push('completed must be a boolean');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateAccessGrant = (req, res, next) => {
  const { user_id } = req.body || {};
  const errors = [];

  if (!Number.isInteger(user_id) || user_id < 1) {
    errors.push('user_id is required (positive integer)');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateWorkOrderNotes = (req, res, next) => {
  const { notes } = req.body || {};
  const errors = [];

  if (typeof notes !== 'string') {
    errors.push('notes is required');
  } else if (notes.length > 4000) {
    errors.push('notes must be a string of max 4000 characters');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

module.exports = {
  validateWorkOrderCreate,
  validateWorkOrderUpdate,
  validateGroupCreate,
  validateGroupUpdate,
  validateItemCreate,
  validateItemUpdate,
  validateReview,
  validateProductionTaskUpdate,
  validateAccessGrant,
  validateWorkOrderNotes,
};