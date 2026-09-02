const { ApiError } = require('./errorHandler');

const requireIntegerParams = (...names) => (req, res, next) => {
  for (const name of names) {
    const raw = req.params[name];
    if (raw === undefined) {
      return next(new ApiError(400, `Missing required path parameter: ${name}`));
    }
    if (!/^\d+$/.test(raw)) {
      return next(new ApiError(400, `Invalid ${name} parameter`));
    }
  }
  next();
};

module.exports = { requireIntegerParams };