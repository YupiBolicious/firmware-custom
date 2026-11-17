const crypto = require('crypto');
const emailActionRepository = require('../repositories/emailActionRepository');
const workOrderRepository = require('../repositories/workOrderRepository');
const { ApiError } = require('../middleware/errorHandler');

const createRequestWorkOrderUrl = async ({ work_order_id, user_id }) => {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const created = await emailActionRepository.createRequestWorkOrderToken({
    token_hash: tokenHash,
    work_order_id,
    user_id,
  });

  if (!created) return null;

  const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${appBaseUrl}/email/request-wo?token=${encodeURIComponent(rawToken)}`;
};

const requestWorkOrderFromEmail = async (rawToken, ip_address) => {
  if (typeof rawToken !== 'string' || rawToken.length < 40 || rawToken.length > 200) {
    throw new ApiError(400, 'Invalid or expired request link');
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const action = await emailActionRepository.consumeRequestWorkOrderToken(tokenHash);
  if (!action) throw new ApiError(410, 'This request link is invalid, expired, or already used');

  const current = await workOrderRepository.findById(action.work_order_id);
  if (!current) throw new ApiError(404, 'Work order not found');

  if (['FINALIZED', 'COMPLETED'].includes(current.status)) {
    return { work_order: current, already_processed: true };
  }
  if (current.status !== 'ANALYZED') {
    throw new ApiError(409, 'Work order is no longer ready to be requested');
  }

  try {
    const workOrderService = require('./workOrderService');
    const result = await workOrderService.finalizeWorkOrder(action.work_order_id, {
      user_id: action.user_id,
      roles: ['PM'],
      ip_address,
    });
    return { ...result, already_processed: false };
  } catch (err) {
    // The normal Work Order button may have finalized the same WO concurrently.
    if (err.statusCode === 409) {
      const latest = await workOrderRepository.findById(action.work_order_id);
      if (latest && ['FINALIZED', 'COMPLETED'].includes(latest.status)) {
        return { work_order: latest, already_processed: true };
      }
    }
    throw err;
  }
};

module.exports = { createRequestWorkOrderUrl, requestWorkOrderFromEmail };
