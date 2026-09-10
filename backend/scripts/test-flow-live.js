const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();
const workOrderService = require('../src/services/workOrderService');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };

const WO = 'WO-TEST-FLOW-001';

(async () => {
  const user = (await pool.query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0];
  const model = (await pool.query(`SELECT id FROM machine_model ORDER BY id LIMIT 1`)).rows[0];
  const mver = (await pool.query(`SELECT id FROM machine_model_ver ORDER BY id LIMIT 1`)).rows[0];
  let woId = null;
  try {
    const wo = (await pool.query(
      `INSERT INTO work_orders (wo_number, title, customer, created_by)
       VALUES ($1, 'flow test', 'TestLab', $2) RETURNING id`, [WO, user.id])).rows[0];
    woId = wo.id;
    const grp = (await pool.query(
      `INSERT INTO work_order_groups (work_order_id, machine_model_id, machine_model_version_id)
       VALUES ($1, $2, $3) RETURNING id`, [woId, model.id, mver.id])).rows[0];
    for (const [num, title] of [['T-01', 'Emergency stop button'], ['T-02', 'Quantum flux deflector calibration']]) {
      await pool.query(
        `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, quantity)
         VALUES ($1, $2, $3, $4, 1)`, [woId, grp.id, num, title]);
    }
    const res = await workOrderService.analyzeWorkOrder(woId, { user_id: user.id, roles: ['PM'], ip_address: '127.0.0.1' });
    ok(res.work_order && res.work_order.status === 'ANALYZED', 'live: WO analyzed');
    ok(Array.isArray(res.results) && res.results.length === 2, 'live: both results present');
    for (const r of res.results) {
      ok('semantic' in r, `live: semantic key present (${r.item_number})`);
      ok('semantic_suggestion' in r, `live: semantic_suggestion key present (${r.item_number})`);
      ok(['CLASSIFIED', 'NON_FIRMWARE', 'CODER_REVIEW'].includes(r.status), `live: valid status (${r.item_number}=${r.status})`);
    }
    ok(res.perf && res.perf.itemsScored === 2, 'live: both dirty items scored');
    console.log('live results: ' + res.results.map((r) => `${r.item_number}=${r.status}`).join(', '));
    if (woId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    const leftInTry = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (leftInTry.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    woId = null;
    console.log(`test-flow-live: OK (${n} assertions, scratch WO removed)`);
    await require('../src/services/embedder').shutdown();
    process.exit(0);
  } finally {
    if (woId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    const left = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (left.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    await pool.end();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
