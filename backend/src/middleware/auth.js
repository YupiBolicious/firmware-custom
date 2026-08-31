const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const { ApiError } = require('./errorHandler');

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);

  if (!token) {
    return next(new ApiError(401, 'Authentication required'));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token'));
  }

  try {
    const user = await userRepository.findUserWithRolesById(decoded.id);
    if (!user) {
      return next(new ApiError(401, 'Account not found'));
    }
    if (!user.is_active) {
      return next(new ApiError(403, 'Account is deactivated'));
    }
    req.user = { id: user.id, email: user.email, full_name: user.full_name, roles: user.roles };
    next();
  } catch (err) {
    next(err);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    if (req.user.roles.includes('ADMIN')) return next();
    const userRoles = req.user.roles || [];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
};

module.exports = { authenticate, authorize };