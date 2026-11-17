const pool = require('../config/db');

const createRequestWorkOrderToken = async ({ token_hash, work_order_id, user_id }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const workOrderResult = await client.query(
      `SELECT id, status, created_by
       FROM work_orders
       WHERE id = $1
       FOR UPDATE`,
      [work_order_id]
    );
    const workOrder = workOrderResult.rows[0];
    if (!workOrder || Number(workOrder.created_by) !== Number(user_id) || workOrder.status !== 'ANALYZED') {
      await client.query('ROLLBACK');
      return false;
    }

    await client.query(
      `UPDATE email_action_tokens
       SET used_at = NOW()
       WHERE work_order_id = $1 AND used_at IS NULL`,
      [work_order_id]
    );
    await client.query(
      `INSERT INTO email_action_tokens (token_hash, work_order_id, user_id, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')`,
      [token_hash, work_order_id, user_id]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const consumeRequestWorkOrderToken = async (token_hash) => {
  const result = await pool.query(
    `UPDATE email_action_tokens AS token
     SET used_at = NOW()
     FROM work_orders AS wo, users AS u
     WHERE token.token_hash = $1
       AND token.work_order_id = wo.id
       AND token.user_id = u.id
       AND token.used_at IS NULL
       AND token.expires_at > NOW()
       AND u.is_active = TRUE
     RETURNING token.work_order_id, token.user_id, wo.status AS work_order_status`,
    [token_hash]
  );
  return result.rows[0] || null;
};

module.exports = { createRequestWorkOrderToken, consumeRequestWorkOrderToken };
