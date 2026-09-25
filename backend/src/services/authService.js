const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/authRepository');
const userRepository = require('../repositories/userRepository');
const auditService = require('./auditService');
const { validateChangePassword } = require('../validators/authValidator');
const { ApiError } = require('../middleware/errorHandler');

const BCRYPT_ROUNDS = 10;

const login = async ({ identifier, password, ip_address }) => {
  const normalized = String(identifier || '').trim().toLowerCase();
  const user = await authRepository.findByIdentifier(normalized);
  if (!user) {
    await auditService.log({
      user_id: null,
      action: 'LOGIN_FAILED',
      entity_type: 'USER',
      entity_id: null,
      details: { identifier: normalized, reason: 'invalid_credentials' },
      ip_address,
    });
    throw new ApiError(401, 'Invalid email/username or password');
  }
  if (!user.is_active) {
    await auditService.log({
      user_id: user.id,
      action: 'LOGIN_FAILED',
      entity_type: 'USER',
      entity_id: user.id,
      details: { identifier: normalized, reason: 'deactivated' },
      ip_address,
    });
    throw new ApiError(403, 'Account is deactivated');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await auditService.log({
      user_id: user.id,
      action: 'LOGIN_FAILED',
      entity_type: 'USER',
      entity_id: user.id,
      details: { identifier: normalized, reason: 'invalid_credentials' },
      ip_address,
    });
    throw new ApiError(401, 'Invalid email/username or password');
  }

  await auditService.log({
    user_id: user.id,
    action: 'USER_LOGIN',
    entity_type: 'USER',
    entity_id: user.id,
    ip_address,
  });

  const roles = await userRepository.findRolesByUserId(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, full_name: user.full_name, roles },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      roles,
    },
  };
};

const changePassword = async ({ userId, current_password, new_password, actorId, ip_address }) => {
  validateChangePassword({ current_password, new_password });

  const user = await authRepository.findByIdWithPassword(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) {
    throw new ApiError(400, 'Current password is incorrect');
  }

  const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  const updated = await authRepository.updatePasswordHash(user.id, hash);
  if (!updated) throw new ApiError(404, 'User not found');

  await auditService.log({
    user_id: actorId,
    action: 'USER_PASSWORD_CHANGED',
    entity_type: 'USER',
    entity_id: String(user.id),
    details: { email: user.email },
    ip_address,
  });

  return { id: user.id, email: user.email };
};

module.exports = { login, changePassword };