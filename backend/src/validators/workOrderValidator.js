const { ApiError } = require('../middleware/errorHandler');

const validateWorkOrderCreate = (req, res, next) => {
  const { wo_number, title } = req.body || {};
  const errors = [];

  if (!wo_number || typeof wo_number !== 'string' || !wo_number.trim()) {
    errors.push('wo_number is required');
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('title is required');
  }
if (!customer || typeof customer !== 'string' || !customer.trim()) {
    errors.push('customer is required');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateWorkOrderUpdate = (req, res, next) => {
  const { title, description, customer, status } = req.body || {};
  const errors = [];

  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    errors.push('title must be a non-empty string');
  }
  if (status !== undefined && !['DRAFT', 'ANALYZED', 'FINALIZED'].includes(status)) {
    errors.push('status must be one of DRAFT, ANALYZED, FINALIZED');
  }
  if (description !== undefined && typeof description !== 'string') {
    errors.push('description must be a string');
  }
  if (customer !== undefined && typeof customer !== 'string') {
    errors.push('customer must be a string');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateItemCreate = (req, res, next) => {
  const { item_number, title } = req.body || {};
  const errors = [];

  if (!item_number || typeof item_number !== 'string' || !item_number.trim()) {
    errors.push('item_number is required');
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    errors.push('title is required');
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

const validateItemUpdate = (req, res, next) => {
  const { title, description, quantity } = req.body || {};
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

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }
  next();
};

module.exports = {
  validateWorkOrderCreate,
  validateWorkOrderUpdate,
  validateItemCreate,
  validateItemUpdate,
};