const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
const ts = Date.now();
const WO_NUM = 'WO-EST-' + ts;
async function api(method, path, token, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
const query = (sql, params) => pool.query(sql, params);
function sumHours(items) {
  let t = 0;
  for (const it of items || []) {
    t += Number(it.estimated_hours) || 0;
  }
  return t;
}
(async () => {
  const login = await api('POST', '/api/auth/login', undefined, { identifier: 'pm@demo.com', password: 'password123' });
  if (!login.data || !login.data.token) throw new Error('login failed');
  const pm = login.data.token;
  const m = await query('SELECT id FROM machine_model WHERE is_active = TRUE ORDER BY id LIMIT 1');
  if (!m.rows[0]) throw new Error('no model');
  let woId = null;
  try {
    const createPayload = {
      wo_number: WO_NUM,
      description: 'Estimation rule live test',
      customer: 'QA',
      groups: [
        { machine_model_id: m.rows[0].id, serial_number: 'SN-' + ts + '-A' },
        { machine_model_id: m.rows[0].id, serial_number: 'SN-' + ts + '-B' }
      ]
    };
    let r = await api('POST', '/api/work-orders', pm, createPayload);
    if (r.status !== 201) throw new Error('create WO: ' + r.status);
    woId = r.data.id;
    const g = await query('SELECT id FROM work_order_groups WHERE work_order_id = $1 ORDER BY id', [woId]);
    const gIds = g.rows.map(x => x.id);
    const itsToAdd = [
      { title: 'Custom Item 1', description: 'Test item 1', quantity: 1 },
      { title: 'Custom Item 2', description: 'Test item 2', quantity: 3 },
      { title: 'Custom Item 3', description: 'Test item 3', quantity: 2 }
    ];
    for (let i = 0; i < itsToAdd.length; i++) {
      let p = { title: itsToAdd[i].title, description: itsToAdd[i].description, quantity: itsToAdd[i].quantity };
      r = await api('POST', '/api/work-orders/' + woId + '/items', pm, p);
      if (r.status !== 201) {
        p = { ...p, work_order_group_id: gIds[0] };
        r = await api('POST', '/api/work-orders/' + woId + '/items', pm, p);
        if (r.status !== 201) throw new Error('add item ' + (i+1) + ': ' + r.status);
      }
    }
    r = await api('POST', '/api/work-orders/' + woId + '/analyze', pm);
    if (r.status !== 200) throw new Error('analyze: ' + r.status);
    r = await api('GET', '/api/work-orders/' + woId, pm);
    if (r.status !== 200) throw new Error('get detail: ' + r.status);
    const det = r.data;
    const its = det.items || [];
    if (its.length < 3) throw new Error('expected >=3 items, got ' + its.length);
    let sum = 0;
    for (let i = 0; i < its.length; i++) {
      const it = its[i];
      sum += Number(it.estimated_hours) || 0;
      if (isNaN(Number(it.estimated_hours))) throw new Error('estimated_hours NaN');
      if (it.quantity == null) throw new Error('quantity missing');
    }
    const wot = Number(det.total_estimated_hours) || sum;
    if (Math.abs(wot - sum) > 0.001) throw new Error('WO total mismatch: woTotal=' + wot + ' sum=' + sum);
    console.log('PASS wo=' + woId + ' items=' + its.length + ' total=' + wot);
  } finally {
    if (woId) {
      try { await query('DELETE FROM audit_trail WHERE entity_id = $1 AND entity_type IN ($2, $3)', [woId, 'WORK_ORDER', 'WORK_ORDER_ITEM']); } catch (e) {}
      try { await query('DELETE FROM notifications WHERE entity_id = $1', [woId]); } catch (e) {}
      try { await query('DELETE FROM work_orders WHERE id = $1', [woId]); } catch (e) {}
      const left = await query('SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1', [WO_NUM]);
      if (left.rows[0].n !== 0) throw new Error('cleanup failed');
    }
    try { await pool.end(); } catch (e) {}
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });