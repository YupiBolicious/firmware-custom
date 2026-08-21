const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/authRepository');
const { ApiError } = require('../middleware/errorHandler');

const login = async ({ username, password }) => {
  const user = await authRepository.findByUsername(username);
  if (!user) {
    throw new ApiError(401, 'Invalid username or password');
  }
  if (!user.is_active) {
    throw new ApiError(403, 'Account is deactivated');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new ApiError(401, 'Invalid username or password');
  }

  const roles = await authRepository.findRolesByUserId(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username, full_name: user.full_name, roles },
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

module.exports = { login };