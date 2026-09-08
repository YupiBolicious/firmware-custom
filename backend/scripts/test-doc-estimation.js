const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();
const estimationService = require('../src/services/estimationService');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

let n = 0;
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const WO = 'WO-TEST-DOC-004';

const levelInfo = async (code) =>
  (await pool.query(`SELECT id, total_hours FROM complexity_levels WHERE code = $1`, [code])).rows[0];

(async () => {
  const user = (await pool.query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0];
  const model = (await pool.query(`SELECT id FROM machine_model ORDER BY id LIMIT 1`)).rows[0];
  const mver = (await pool.query(`SELECT id FROM machine_model_ver ORDER BY id LIMIT 1`)).rows[0];
  const L1 = await levelInfo('L1');
  const L2 = await levelInfo('L2');
  const L4 = await levelInfo('L4');
  let woId = null;
  try {
    const wo = (await pool.query(
      `INSERT INTO work_orders (wo_number, title, customer, created_by)
       VALUES ($1, 'doc estimation test', 'TestLab', $2) RETURNING id`,
      [WO, user.id]
    )).rows[0];
    woId = wo.id;
    const grp = (await pool.query(
      `INSERT INTO work_order_groups (work_order_id, machine_model_id, machine_model_version_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [woId, model.id, mver.id]
    )).rows[0];
    const item = (await pool.query(
      `INSERT INTO work_order_items (work_order_id, work_order_group_id, item_number, title, quantity)
       VALUES ($1, $2, 'T-01', 'doc test item', 1) RETURNING id`,
      [woId, grp.id]
    )).rows[0];

    const run = async (cxId, readiness) => {
      await pool.query(`UPDATE work_order_items SET documentation_readiness = $2 WHERE id = $1`,
        [item.id, readiness]);
      return estimationService.createOrUpdateEstimation({
        work_order_item_id: item.id, complexity_level_id: cxId,
      });
    };
    const num = (v) => Number(v);

    let r = await run(L2.id, null);
    eq(r.verification_code, 'V2', 'L2: tier V2');
    eq(num(r.breakdown.verification_mh), 24, 'L2: verification 24 MH');
    eq(num(r.breakdown.other_mh), num(L2.total_hours), 'L2: other = complexity total, unchanged');
    eq(num(r.breakdown.total_hours), 24 + num(L2.total_hours), 'L2: total = 24 + other');
    eq(num(r.total_hours), 24 + num(L2.total_hours), 'L2: stored total matches');
    eq('documentation_mh' in r.breakdown, false, 'L2: no documentation key in breakdown');

    r = await run(L1.id, null);
    eq(r.verification_code, 'V1', 'L1: tier V1');
    eq(num(r.breakdown.verification_mh), 8, 'L1: verification 8 MH');
    eq(num(r.breakdown.total_hours), 8 + num(L1.total_hours), 'L1: total = 8 + other');

    r = await run(L4.id, null);
    eq(r.verification_code, 'V2', 'L4: tier V2 (remapped)');
    eq(num(r.breakdown.verification_mh), 24, 'L4: verification 24 MH');

    r = await run(L2.id, 'MISSING');
    eq(r.verification_code, 'V3', 'MISSING readiness: forced to V3');
    eq(num(r.breakdown.verification_mh), 40, 'MISSING: verification 40 MH');
    eq(num(r.breakdown.total_hours), 40 + num(L2.total_hours), 'MISSING: total = 40 + other');

    r = await run(null, null);
    eq(r, null, 'null complexity: no estimation (existing behavior preserved)');

    await pool.query(`UPDATE work_order_items SET quantity = 2 WHERE id = $1`, [item.id]);
    r = await run(L2.id, null);
    const line = await pool.query(
      `SELECT COALESCE(ie.verification_mh, 0) + (COALESCE(ie.total_hours, 0) - COALESCE(ie.verification_mh, 0)) * COALESCE(woi.quantity, 1) AS line_total
       FROM item_estimations ie JOIN work_order_items woi ON woi.id = ie.work_order_item_id
       WHERE ie.work_order_item_id = $1`,
      [item.id]
    );
    eq(num(line.rows[0].line_total), 24 + num(L2.total_hours) * 2, 'L2 qty2: line = ver once + other x qty');

    const cols = await pool.query(`SELECT COUNT(*)::int AS n FROM complexity_levels WHERE code IN ('L1','L2','L4')`);
    eq(cols.rows[0].n, 3, 'complexity rows intact');
    console.log(`test-doc-estimation: OK (${n} assertions, scratch WO removed)`);
  } finally {
    if (woId) await pool.query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    const left = await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (left.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    await pool.end();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
