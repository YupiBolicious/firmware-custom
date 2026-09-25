const { ApiError } = require('../middleware/errorHandler');

const MAX_PAGE_LIMIT = 100;

const validatePagination = (page = 1, limit = 15) => {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new ApiError(400, 'Page must be a positive integer');
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_PAGE_LIMIT) {
    throw new ApiError(400, `Limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`);
  }
  return { page: parsedPage, limit: parsedLimit };
};

const paginatedPayload = (items, total, page, limit) => ({
  items,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = { validatePagination, paginatedPayload, MAX_PAGE_LIMIT };