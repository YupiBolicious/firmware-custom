const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');

// Verify JWT and attach user to request
const authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(new ApiError(401, 'Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, username, full_name, roles: [] }
    next();
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token'));
  }
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    const userRoles = req.user.roles || [];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
};

module.exports = { authenticate, authorize };