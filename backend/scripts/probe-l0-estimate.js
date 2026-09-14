// Live probe: non-firmware items must surface L0 in the estimate state (0h estimation).
// Creates a scratch WO with a known non-firmware title, analyzes it, asserts
// complexity_code=L0 + estimated_hours=0 via BOTH analyzeWorkOrder results and
// the estimate-state query (findItemsByWorkOrderId), then removes the scratch WO.
const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();
const workOrderService = require('../src/services/workOrderService');
const workOrderRepository = require('../src/repositories/workOrderRepository');
const estimationRepository = require('../src/repositories/estimationRepository');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const WO = 'WO-L0-PROBE-001';

(async () => {
  const user = (await pool.query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0];
  const model = (await pool.query(`SELECT id FROM machine_model ORDER BY id LIMIT 1`)).rows[0];
  const mver = (await pool.query(`SELECT id FROM machine_model_ver ORDER BY id LIMIT 1`)).rows[0];
  const kb = (await pool.query(
    `SELECT kb_code, title FROM kb_items WHERE fw_related = FALSE AND is_active = TRUE ORDER BY id LIMIT 1`
  )).rows[0];
  assert(kb, 'need an active non-firmware KB item to seed the probe');
  const l0 = await estimationRepository.findComplexityLevelByCode('L0');
  assert(l0, 'L0 level must exist');

  let woId = null;
  let itemId = null;
  try {
    const wo = (await pool.query(
      `INSERT INTO work_orders (wo_number, title, customer, created_by) VALUES ($1, $2, 'TestLab', $3) RETURNING id`,
      [WO, 'L0 estimate probe', user.id]
    )).rows[0];
    woId = wo.id;
    const grp = (await pool.query(
      `INSERT INTO work_order_groups (work_order_id, machine_model_id, machine_model_version_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [woId, model.id, mver.id]
    )).rows[0];
    const item = (await pool.query(
      `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, quantity)
       VALUES ($1, $2, 'T-01', $3, 1) RETURNING id`,
      [woId, grp.id, kb.title]
    )).rows[0];
    itemId = item.id;

    const res = await workOrderService.analyzeWorkOrder(woId, { user_id: user.id, roles: ['PM'], ip_address: '127.0.0.1' });
    assert(res.work_order.status === 'ANALYZED', 'WO analyzed');
    const r = res.results.find((x) => x.item_id === item.id);
    assert(r, 'probe item result present');
    assert.strictEqual(r.status, 'NON_FIRMWARE', `status = NON_FIRMWARE (got ${r.status})`);
    assert.strictEqual(r.complexity_code, 'L0', `complexity_code = L0 (got ${r.complexity_code})`);
    assert.strictEqual(Number(r.estimated_hours), 0, `estimated_hours = 0 (got ${r.estimated_hours})`);

    // estimate-state query (what WorkOrderDetail renders)
    const items = await workOrderRepository.findItemsByWorkOrderId(woId);
    const q = items.find((x) => x.id === item.id);
    assert(q, 'item present in estimate-state query');
    assert.strictEqual(q.complexity_code, 'L0', `estimate query complexity_code = L0 (got ${q.complexity_code})`);
    assert.strictEqual(Number(q.estimated_hours), 0, `estimate query estimated_hours = 0 (got ${q.estimated_hours})`);

    // persisted estimation row: L0 id, zero hours
    const est = await pool.query(
      `SELECT ie.*, cl.code AS cx_code FROM item_estimations ie
       JOIN complexity_levels cl ON cl.id = ie.complexity_level_id
       WHERE ie.work_order_item_id = $1`, [item.id]
    );
    assert.strictEqual(est.rows.length, 1, 'estimation row exists for non-firmware item');
    assert.strictEqual(est.rows[0].cx_code, 'L0', 'estimation row references L0');
    assert.strictEqual(Number(est.rows[0].total_hours), 0, 'estimation total_hours = 0');

    console.log('probe-l0-estimate: OK (status=' + r.status + ', code=' + q.complexity_code + ', hours=' + Number(q.estimated_hours) + ', scratch WO removed)');
  } finally {
    if (woId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    const left = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (left.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    await pool.end();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });