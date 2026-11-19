// ETA-on-assignment live verification (service level; no backend server needed).
// Creates two scratch FINALIZED WOs with two items each (only the highest item
// estimate per WO counts), assigns both, checks cumulative workload/ETA/unassign.
const assert = require('assert');
const path = require('path');
const backendDir = path.join(__dirname, '..', 'backend');
require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: path.join(backendDir, '.env') });

const pool = require('../backend/src/config/db');
const workOrderService = require('../backend/src/services/workOrderService');
const workOrderRepository = require('../backend/src/repositories/workOrderRepository');
const emailService = require('../backend/src/services/emailService');
const { calculateEta } = require('../backend/src/utils/workingDays');

// a scratch test must never send a real customer email
emailService.sendMail = async () => ({ id: 'stub' });

const PREFIX = 'WO-ETA-' + Date.now();
let checks = 0;
const ok = (value, msg) => { checks++; assert.ok(value, msg); };

(async () => {
  const baselineWo = (await pool.query('SELECT COUNT(*)::int c FROM work_orders')).rows[0].c;
  const baselineAudit = (await pool.query('SELECT COUNT(*)::int c FROM audit_trail')).rows[0].c;

  const pm = (await pool.query(`SELECT id FROM users WHERE email = 'pm@demo.com'`)).rows[0];
  const admin = (await pool.query(`SELECT id FROM users WHERE email = 'admin@demo.com'`)).rows[0];
  const coder = (await pool.query(
    `SELECT u.id FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.code = 'CODER' AND u.is_active = TRUE ORDER BY u.id LIMIT 1`)).rows[0];
  const level = (await pool.query(`SELECT id FROM complexity_levels WHERE code = 'L3'`)).rows[0];
  ok(pm && admin && coder && level, 'seed users and complexity level present');

  const queueHours = async () => Number((await pool.query(
    `SELECT COALESCE(SUM(q.work_hours), 0) AS h
     FROM (
       SELECT wo.id, COALESCE(MAX(ie.total_hours), 0) AS work_hours
       FROM work_orders wo
       LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
       LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
       WHERE wo.assigned_coder_id = $1
         AND wo.status IN ('FINALIZED','PRODUCTION','READY_TO_CLOSE')
       GROUP BY wo.id
     ) q`, [coder.id])).rows[0].h);
  const baseHours = await queueHours();

  const ids = [];
  try {
    // [12, 3] -> 12h; [20, 40] -> 40h; lower items must not add to the queue
    for (const [suffix, estimates] of [['-1', [12, 3]], ['-2', [20, 40]]]) {
      const wo = (await pool.query(
        `INSERT INTO work_orders (wo_number, title, customer, status, created_by)
         VALUES ($1, 'eta smoke', 'SmokeLab', 'FINALIZED', $2) RETURNING id`,
        [PREFIX + suffix, pm.id])).rows[0];
      ids.push(wo.id);

      for (const [index, hours] of estimates.entries()) {
        const item = (await pool.query(
          `INSERT INTO work_order_items (work_order_id, item_number, title, quantity)
           VALUES ($1, $2, 'smoke item', 1) RETURNING id`,
          [wo.id, `ETA-${index + 1}`])).rows[0];

        await pool.query(
          `INSERT INTO item_estimations
             (work_order_item_id, complexity_level_id, requirement_review_h, code_development_h,
              peer_review_fixing_h, bench_testing_h, unit_testing_h, total_hours, verification_mh)
           VALUES ($1, $2, 0, 0, 0, 0, 0, $3, 0)`, [item.id, level.id, hours]);
      }
    }

    const first = await workOrderService.assignWorkOrderCoder(ids[0], {
      coder_id: coder.id, user_id: admin.id, ip_address: '127.0.0.1',
    });
    ok(first.assigned_at, 'assignment sets assigned_at');
    ok(first.estimated_completion_date === calculateEta(first.assigned_at, baseHours + 12),
      `first ETA uses baseline ${baseHours}h + max(12,3)h (got ${first.estimated_completion_date})`);

    const second = await workOrderService.assignWorkOrderCoder(ids[1], {
      coder_id: coder.id, user_id: admin.id, ip_address: '127.0.0.1',
    });
    ok(second.estimated_completion_date === calculateEta(second.assigned_at, baseHours + 52),
      `second ETA uses baseline ${baseHours}h + 12h + max(20,40)h (got ${second.estimated_completion_date})`);

    const queue = (await pool.query(
      `SELECT COALESCE(SUM(q.work_hours), 0) AS total_work_hours
       FROM (
         SELECT wo.id, COALESCE(MAX(ie.total_hours), 0) AS work_hours
         FROM work_orders wo
         LEFT JOIN work_order_items woi ON woi.work_order_id = wo.id
         LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
         WHERE wo.assigned_coder_id = $1 AND wo.id = ANY($2::int[])
         GROUP BY wo.id
       ) q`, [coder.id, ids])).rows[0];
    ok(Number(queue.total_work_hours) === 52, 'engineer queue hours = 12 + 40 (highest per WO)');

    const detail = await workOrderRepository.findById(ids[1]);
    ok(detail.assigned_at && detail.estimated_completion_date,
      'findById exposes assigned_at and estimated_completion_date');
    ok(Number(detail.work_hours) === 40, 'findById work_hours = highest item estimate (40)');
    ok(Number(detail.total_estimated_hours) === 60,
      'findById total_estimated_hours still sums items (60)');

    const list = await workOrderRepository.findAll({ page: 1, limit: 15, search: PREFIX });
    const listed = list.items.find((r) => r.id === ids[1]);
    ok(listed && Number(listed.work_hours) === 40, 'findAll work_hours = highest item estimate (40)');

    const unassigned = await workOrderService.assignWorkOrderCoder(ids[1], {
      coder_id: null, user_id: admin.id, ip_address: '127.0.0.1',
    });
    ok(!unassigned.assigned_at && !unassigned.estimated_completion_date,
      'unassign clears assigned_at and estimated_completion_date');

    console.log(`_verify_eta: OK (${checks} assertions)`);
  } finally {
    if (ids.length) {
      await pool.query('DELETE FROM audit_trail WHERE work_order_id = ANY($1::int[])', [ids]);
      await pool.query('DELETE FROM work_orders WHERE id = ANY($1::int[])', [ids]);
    }
    const afterWo = (await pool.query('SELECT COUNT(*)::int c FROM work_orders')).rows[0].c;
    const afterAudit = (await pool.query('SELECT COUNT(*)::int c FROM audit_trail')).rows[0].c;
    ok(afterWo === baselineWo && afterAudit === baselineAudit, 'baseline restored');
    await pool.end();
  }
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
