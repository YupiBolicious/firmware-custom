const { ApiError } = require('../middleware/errorHandler');

const MIN_PASSWORD_LENGTH = 8;

const validateChangePassword = (body) => {
  const errors = [];
  if (!body.current_password || typeof body.current_password !== 'string') {
    errors.push('Current password is required');
  }
  if (!body.new_password || typeof body.new_password !== 'string' || body.new_password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (body.new_password && body.new_password === body.current_password) {
    errors.push('New password must be different from the current password');
  }
  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }
};

const validateLogin = (body) => {
  const errors = [];
  if (!body.email || typeof body.email !== 'string') {
    errors.push('Email is required');
  }
  if (!body.password || typeof body.password !== 'string') {
    errors.push('Password is required');
  }
  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }
};

module.exports = { validateChangePassword, validateLogin };