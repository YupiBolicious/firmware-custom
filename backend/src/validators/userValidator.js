const { ApiError } = require('../middleware/errorHandler');

const VALID_ROLES = ['PM', 'CODER', 'ADMIN'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USERNAME_RE = /^[a-zA-Z0-9@._-]{3,100}$/;

const MIN_PASSWORD_LENGTH = 8;

const validateEmail = (email) => {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
};

// Empty/unset ALLOWED_EMAIL_DOMAINS means no domain restriction.
const allowedEmailDomains = () =>
  String(process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

const emailDomainError = (email) => {
  const allowed = allowedEmailDomains();
  if (!allowed.length) return null;
  const domain = String(email).trim().toLowerCase().split('@')[1];
  if (allowed.includes(domain)) return null;
  return `Email must be on an approved company domain (${allowed.join(', ')})`;
};

// Syntax error first, then the domain allowlist.
const emailError = (email) => {
  if (!validateEmail(email)) return 'A valid email is required';
  return emailDomainError(email);
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
  const emailErr = emailError(body.email);
  if (emailErr) {
    errors.push(emailErr);
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
  if (body.username !== undefined) {
    errors.push('Username cannot be changed after creation (immutable)');
  }
  if (body.email !== undefined) {
    const emailErr = emailError(body.email);
    if (emailErr) errors.push(emailErr);
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

const validateProfile = (body) => {
  const errors = [];
  const emailErr = emailError(body.email);
  if (emailErr) {
    errors.push(emailErr);
  }
  if (!body.full_name || String(body.full_name).trim() === '') {
    errors.push('Full name is required');
  }
  if (errors.length) fail(errors);
};

module.exports = { validateUserCreate, validateUserUpdate, validatePasswordReset, validateProfile, VALID_ROLES };