const { ApiError } = require('../middleware/errorHandler');

const VALID_ROLES = ['PM', 'CODER', 'ADMIN'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USERNAME_RE = /^[a-zA-Z0-9@._-]{3,100}$/;

const MIN_PASSWORD_LENGTH = 8;

const validateEmail = (email) => {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
};

const validateUsername = (username) => {
  return typeof username === 'string' && USERNAME_RE.test(username.trim());
};

const validatePassword = (password) => {
  return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
};

const validateRoles = (roles) => {
  return Array.isArray(roles) && roles.length > 0 && roles.every((r) => VALID_ROLES.includes(r));
};

const fail = (errors) => {
  throw new ApiError(400, 'Validation failed', errors);
};

const validateUserCreate = (body) => {
  const errors = [];
  if (!validateEmail(body.email)) {
    errors.push('A valid email is required');
  }
  if (!validateUsername(body.username)) {
    errors.push('Username is required (3-100 characters, stored lowercase: letters, digits, @ . _ -)');
  }
  if (!validateRoles(body.roles)) {
    errors.push(`At least one role is required (${VALID_ROLES.join(', ')})`);
  }
  if (!validatePassword(body.default_password)) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!body.full_name || String(body.full_name).trim() === '') {
    errors.push('Full name is required');
  }
  if (errors.length) fail(errors);
};

const validateUserUpdate = (body) => {
  const errors = [];
  if (body.username !== undefined && !validateUsername(body.username)) {
    errors.push('Username must be 3-100 characters, stored lowercase: letters, digits, @ . _ -');
  }
  if (body.full_name !== undefined && String(body.full_name).trim() === '') {
    errors.push('Full name cannot be empty');
  }
  if (body.roles !== undefined && !validateRoles(body.roles)) {
    errors.push(`Roles must be a non-empty subset of ${VALID_ROLES.join(', ')}`);
  }
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
    errors.push('is_active must be a boolean');
  }
  if (errors.length) fail(errors);
};

const validatePasswordReset = (body) => {
  const errors = [];
  if (!validatePassword(body.new_password)) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (errors.length) fail(errors);
};

module.exports = { validateUserCreate, validateUserUpdate, validatePasswordReset, VALID_ROLES };