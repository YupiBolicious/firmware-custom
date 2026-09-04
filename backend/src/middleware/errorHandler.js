// Centralized error handling + consistent API responses

class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
};

const PG_ERROR_MAP = {
  '22P02': 400,
  '22P01': 400,
  '22P03': 400,
  '22007': 400,
  '22008': 400,
  '22003': 400,
  '23502': 400,
  '23503': 400,
  '23514': 400,
  '23505': 409,
};

const PG_ERROR_MESSAGES = {
  '22P02': 'Invalid input format',
  '22P01': 'Invalid input value',
  '22P03': 'Invalid binary value',
  '22007': 'Invalid date/time format',
  '22008': 'Invalid date/time value',
  '22003': 'Value is out of range',
  '23502': 'A required value is missing',
  '23503': 'Referenced record does not exist or is in use',
  '23514': 'Value violates a data constraint',
  '23505': 'A record with the same unique value already exists',
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const errors = err.errors || [];

  if (!err.statusCode && err.code && PG_ERROR_MAP[err.code]) {
    return res.status(PG_ERROR_MAP[err.code]).json({
      success: false,
      message: PG_ERROR_MESSAGES[err.code] || message,
      errors: [],
    });
  }

  if (statusCode >= 500) {
    console.error('Unhandled error:', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

module.exports = { ApiError, notFound, errorHandler };