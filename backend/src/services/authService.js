const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/authRepository');
const userRepository = require('../repositories/userRepository');
const auditService = require('./auditService');
const mailService = require('./mailService');
const lockoutStore = require('./lockoutStore');
const { validateChangePassword, validateForgotPassword, validateResetPassword } = require('../validators/authValidator');
const { validateProfile } = require('../validators/userValidator');
const { ApiError } = require('../middleware/errorHandler');

const BCRYPT_ROUNDS = 10;

const INVALID_MSG = 'invalid username or password. check your credentials and try again';
const LOCKED_MSG = `Too many failed login attempts. Login is temporarily locked for ${Math.round(lockoutStore.LOCK_MS / 60000)} minutes. Click forgot password or contact admin to reset your password.`;

const login = async ({ identifier, password, ip_address }) => {
  const normalized = String(identifier || '').trim().toLowerCase();

  const locked = lockoutStore.check(normalized);
  if (locked > 0) {
    throw new ApiError(429, LOCKED_MSG, [], { retry_after: Math.ceil(locked / 1000) });
  }

  const registerLocked = async (userId, reason) => {
    const next = lockoutStore.registerFailure(normalized);
    if (next.locked) {
      await auditService.log({
        user_id: userId,
        action: 'LOGIN_LOCKED',
        entity_type: 'USER',
        entity_id: userId,
        details: { identifier: normalized, reason },
        ip_address,
      });
      throw new ApiError(429, LOCKED_MSG, [], { retry_after: next.retry_after });
    }
    return false;
  };

  const user = await authRepository.findByIdentifier(normalized);
  if (!user) {
    if (await registerLocked(null, 'invalid_credentials')) return;
    await auditService.log({
      user_id: null,
      action: 'LOGIN_FAILED',
      entity_type: 'USER',
      entity_id: null,
      details: { identifier: normalized, reason: 'invalid_credentials' },
      ip_address,
    });
    throw new ApiError(401, INVALID_MSG);
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
    if (await registerLocked(user.id, 'invalid_credentials')) return;
    await auditService.log({
      user_id: user.id,
      action: 'LOGIN_FAILED',
      entity_type: 'USER',
      entity_id: user.id,
      details: { identifier: normalized, reason: 'invalid_credentials' },
      ip_address,
    });
    throw new ApiError(401, INVALID_MSG);
  }

  lockoutStore.reset(normalized);

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

const updateProfile = async ({ userId, body, ip_address }) => {
  validateProfile(body);

  const existing = await userRepository.findUserWithRolesById(userId);
  if (!existing) {
    throw new ApiError(404, 'User not found');
  }

  const email = String(body.email || '').trim().toLowerCase();
  const full_name = String(body.full_name || '').trim();

  const emailOwner = await userRepository.findByEmailId(email);
  if (emailOwner && emailOwner.id !== userId) {
    throw new ApiError(409, 'Email is already in use');
  }

  const updated = await userRepository.update(userId, { email, full_name });
  if (!updated) throw new ApiError(404, 'User not found');

  await auditService.log({
    user_id: userId,
    action: 'USER_PROFILE_UPDATED',
    entity_type: 'USER',
    entity_id: String(userId),
    details: {
      prior: { email: existing.email, full_name: existing.full_name },
      current: { email, full_name },
    },
    ip_address,
  });

  return userRepository.findUserWithRolesById(userId);
};

const RESET_TTL_MINUTES = parseInt(process.env.RESET_TOKEN_TTL_MINUTES, 10) || 30;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX_REQUESTS = 3;
const FORGOT_MSG = 'If that email is registered, a reset link has been sent.';

const resetRequests = new Map();

// shortcut: in-memory throttle, resets on restart; move to DB/Redis for multi-instance.
const isThrottled = (email) => {
  const now = Date.now();
  if (resetRequests.size > 1000) {
    for (const [key, entry] of resetRequests) {
      if (now - entry.startedAt >= RESET_WINDOW_MS) resetRequests.delete(key);
    }
  }
  const entry = resetRequests.get(email);
  if (entry && now - entry.startedAt < RESET_WINDOW_MS) {
    if (entry.count >= RESET_MAX_REQUESTS) return true;
    entry.count += 1;
    return false;
  }
  resetRequests.set(email, { count: 1, startedAt: now });
  return false;
};

const fingerprint = (passwordHash) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(passwordHash).digest('hex');

const signResetToken = (user) => jwt.sign(
  { sub: String(user.id), purpose: 'password_reset', pwd: fingerprint(user.password_hash) },
  process.env.JWT_SECRET,
  { expiresIn: `${RESET_TTL_MINUTES}m` }
);

const verifyResetToken = (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(400, 'This reset link is invalid or has expired');
  }
  if (decoded.purpose !== 'password_reset') {
    throw new ApiError(400, 'This reset link is invalid or has expired');
  }
  return decoded;
};

const sameFingerprint = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const forgotPassword = async ({ email, ip_address }) => {
  validateForgotPassword({ email });
  const normalized = String(email).trim().toLowerCase();
  if (isThrottled(normalized)) return { message: FORGOT_MSG };

  const user = await authRepository.findEmailWithPassword(normalized);
  // Same response for unknown or deactivated accounts: never confirm existence.
  if (!user || !user.is_active) return { message: FORGOT_MSG };

  const base = process.env.APP_RESET_URL || 'http://localhost:5173/reset-password';
  const resetUrl = `${base}?token=${encodeURIComponent(signResetToken(user))}`;

  const notification = await mailService.sendPasswordReset({
    to: user.email,
    username: user.username,
    resetUrl,
    expiresMinutes: RESET_TTL_MINUTES,
  });

  await auditService.log({
    user_id: user.id,
    action: 'USER_PASSWORD_RESET_REQUESTED',
    entity_type: 'USER',
    entity_id: String(user.id),
    details: { email: user.email, sent: notification.sent, error: notification.error || undefined },
    ip_address,
  });

  return { message: FORGOT_MSG };
};

const resetPasswordByToken = async ({ token, new_password, ip_address }) => {
  validateResetPassword({ new_password });
  const decoded = verifyResetToken(token);

  const userId = Number(decoded.sub);
  if (!Number.isInteger(userId)) {
    throw new ApiError(400, 'This reset link is invalid or has expired');
  }

  const user = await authRepository.findByIdWithPassword(userId);
  // A changed password also invalidates every outstanding link (fingerprint mismatch).
  if (!user || !user.is_active || !sameFingerprint(decoded.pwd, fingerprint(user.password_hash))) {
    throw new ApiError(400, 'This reset link is invalid or has expired');
  }

  if (await bcrypt.compare(new_password, user.password_hash)) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  const updated = await authRepository.updatePasswordHash(user.id, hash);
  if (!updated) throw new ApiError(404, 'User not found');

  // A locked-out user must be able to sign in with the new password.
  lockoutStore.reset(String(user.email).trim().toLowerCase());
  lockoutStore.reset(String(user.username).trim().toLowerCase());

  await auditService.log({
    user_id: user.id,
    action: 'USER_PASSWORD_RESET_BY_TOKEN',
    entity_type: 'USER',
    entity_id: String(user.id),
    details: { email: user.email },
    ip_address,
  });

  return { email: user.email };
};
module.exports = { login, changePassword, updateProfile, forgotPassword, resetPasswordByToken};