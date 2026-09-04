const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const auditService = require('./auditService');
const userValidator = require('../validators/userValidator');
const { ApiError } = require('../middleware/errorHandler');

const BCRYPT_ROUNDS = 10;

const listUsers = async () => {
  return userRepository.findAll();
};

const listPmUsers = async () => {
  return userRepository.findAllByRole('PM');
};

const createUser = async ({ actorId, body, ip_address }) => {
  userValidator.validateUserCreate(body);

  const email = String(body.email).trim().toLowerCase();
  const username = String(body.username).trim().toLowerCase();
  const dupEmail = await userRepository.findByEmailId(email);
  if (dupEmail) {
    throw new ApiError(409, 'A user with this email already exists');
  }
  const dupUsername = await userRepository.findByUsernameId(username);
  if (dupUsername) {
    throw new ApiError(409, 'A user with this username already exists');
  }

  const hash = await bcrypt.hash(body.default_password, BCRYPT_ROUNDS);
  const created = await userRepository.createWithRoles({
    username,
    email,
    password_hash: hash,
    full_name: String(body.full_name).trim(),
    roleCodes: body.roles,
  });

  await auditService.log({
    user_id: actorId,
    action: 'USER_CREATED',
    entity_type: 'USER',
    entity_id: String(created.id),
    details: { username, email, full_name: created.full_name, roles: created.roles },
    ip_address,
  });

  return created;
};

const updateUser = async ({ actorId, id, body, ip_address }) => {
  userValidator.validateUserUpdate(body);

  const existing = await userRepository.findUserWithRolesById(id);
  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  if (body.username !== undefined && String(body.username).trim().toLowerCase() !== existing.username.toLowerCase()) {
    const dupUsername = await userRepository.findByUsernameId(String(body.username).trim().toLowerCase());
    if (dupUsername) {
      throw new ApiError(409, 'A user with this username already exists');
    }
  }

  if (Number(id) === Number(actorId)
    && body.is_active === false
    && existing.is_active === true
    && Array.isArray(existing.roles)
    && existing.roles.includes('ADMIN')) {
    const activeAdmins = await userRepository.countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new ApiError(400, 'Cannot deactivate your own account while you are the only active ADMIN');
    }
  }

  const updated = await userRepository.updateWithRoles(id, {
    username: body.username !== undefined ? String(body.username).trim().toLowerCase() : undefined,
    full_name: body.full_name !== undefined ? String(body.full_name).trim() : undefined,
    is_active: body.is_active,
    roleCodes: body.roles,
  });

  await auditService.log({
    user_id: actorId,
    action: 'USER_UPDATED',
    entity_type: 'USER',
    entity_id: String(id),
    details: {
      email: existing.email,
      prior: { full_name: existing.full_name, is_active: existing.is_active, roles: existing.roles },
      current: { full_name: updated.full_name, is_active: updated.is_active, roles: updated.roles },
    },
    ip_address,
  });

  return updated;
};

const resetPassword = async ({ actorId, id, body, ip_address }) => {
  userValidator.validatePasswordReset(body);

  const existing = await userRepository.findUserWithRolesById(id);
  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  const hash = await bcrypt.hash(body.new_password, BCRYPT_ROUNDS);
  const updated = await userRepository.updatePasswordHash(id, hash);
  if (!updated) {
    throw new ApiError(404, 'User not found');
  }

  await auditService.log({
    user_id: actorId,
    action: 'USER_PASSWORD_RESET',
    entity_type: 'USER',
    entity_id: String(id),
    details: { email: existing.email },
    ip_address,
  });

  return { id: existing.id, email: existing.email };
};

module.exports = { listUsers, listPmUsers, createUser, updateUser, resetPassword };