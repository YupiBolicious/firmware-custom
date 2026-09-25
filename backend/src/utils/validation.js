const { ApiError } = require('../middleware/errorHandler');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Format match is not enough: values like 2026-13-99 pass the regex but are
// not real calendar dates and would blow up in Postgres (22008).
const isRealDate = (s) => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const assertOptionalDate = (name, value) => {
  if (value === undefined || value === null || value === '') return;
  if (!isRealDate(value)) {
    throw new ApiError(400, 'Validation failed', [`"${name}" must be a valid YYYY-MM-DD date`]);
  }
};

const assertOptionalInt = (name, value) => {
  if (value === undefined || value === null || value === '') return;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new ApiError(400, 'Validation failed', [`"${name}" must be a positive integer`]);
  }
};

module.exports = { isRealDate, assertOptionalDate, assertOptionalInt };
