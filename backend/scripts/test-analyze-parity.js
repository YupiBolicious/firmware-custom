const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();
const workOrderService = require('../src/services/workOrderService');
const classificationService = require('../src/services/classificationService');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

let n = 0;
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const WO = 'WO-TEST-PROBE-PARITY-001';
const TITLES = [
  'Emergency stop button',
  'Merge Point',
  'alarm bms',
  'glass panel',
  'Quantum flux deflector calibration',
];

(async () => {
  const user = (await pool.query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0];
  const model = (await pool.query(`SELECT id FROM machine_model ORDER BY id LIMIT 1`)).rows[0];
  const mver = (await pool.query(`SELECT id FROM machine_model_ver ORDER BY id LIMIT 1`)).rows[0];
  let woId = null;
  try {
    const wo = (await pool.query(
      `INSERT INTO work_orders (wo_number, title, customer, created_by)
       VALUES ($1, 'probe parity', 'TestLab', $2) RETURNING id`, [WO, user.id])).rows[0];
    woId = wo.id;
    const grp = (await pool.query(
      `INSERT INTO work_order_groups (work_order_id, machine_model_id, machine_model_version_id)
       VALUES ($1, $2, $3) RETURNING id`, [woId, model.id, mver.id])).rows[0];
    for (let i = 0; i < TITLES.length; i++) {
      await pool.query(
        `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, quantity)
         VALUES ($1, $2, $3, $4, 1)`, [woId, grp.id, `T-0${i + 1}`, TITLES[i]]);
    }
    const res = await workOrderService.analyzeWorkOrder(woId, { user_id: user.id, roles: ['PM'], ip_address: '127.0.0.1' });
    eq(res.results.length, TITLES.length, 'analyze: all probe items returned');
    for (const r of res.results) {
      const direct = await classificationService.classifyItem({
        title: r.title, description: '', quantity: 1, machine_model_id: model.id, machine_model_version_id: mver.id,
      });
      eq(r.status, direct.status, `parity ${r.title}: analyze status == direct status (${r.status})`);
      eq(r.classification_method, direct.classification_method, `parity ${r.title}: method matches (${r.classification_method})`);
    }
    console.log(`test-analyze-parity: OK (${n} assertions, scratch WO removed)`);
    await require('../src/services/embedder').shutdown();
    if (woId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    const leftCheck = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (leftCheck.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    woId = null;
    process.exit(0);
  } finally {
    if (woId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    const left = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (left.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    await pool.end();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
