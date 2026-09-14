// Live HTTP probe: non-firmware item must surface L0 in the estimate state via the API.
// Drives create-WO -> add item (known non-firmware KB title) -> analyze -> GET detail,
// asserts items[].complexity_code = 'L0' and estimated_hours = 0, then cleans up
// (audit rows first, then WO cascade).
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

const WO = 'WO-L0-HTTP-' + Date.now();

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

(async () => {
  const login = await api('POST', '/api/auth/login', undefined, { identifier: 'pm@demo.com', password: 'password123' });
  if (!login.data || !login.data.token) throw new Error('login failed');
  const pm = login.data.token;

  const kb = (await query(
    `SELECT title FROM kb_items WHERE fw_related = FALSE AND is_active = TRUE ORDER BY id LIMIT 1`
  )).rows[0];
  if (!kb) throw new Error('no active non-firmware KB item');
  const model = (await query(`SELECT id FROM machine_model ORDER BY id LIMIT 1`)).rows[0];
  const mver = (await query(`SELECT id FROM machine_model_ver ORDER BY id LIMIT 1`)).rows[0];
  if (!model || !mver) throw new Error('no machine model seed');

  let woId = null;
  try {
    let r = await api('POST', '/api/work-orders', pm, {
      wo_number: WO, title: 'L0 HTTP probe', description: 'l0 probe', customer: 'QA',
      groups: [{ machine_model_id: model.id, machine_model_version_id: mver.id, serial_number: 'l0-' + Date.now() }],
    });
    if (r.status !== 201) throw new Error('create WO: ' + r.status + ' ' + (r.json && r.json.message));
    woId = r.data.id;
    const groupId = r.data.groups[0].id;

    r = await api('POST', `/api/work-orders/${woId}/items`, pm, {
      work_order_group_id: groupId, title: kb.title, quantity: 1,
    });
    if (r.status !== 201) throw new Error('add item: ' + r.status + ' ' + (r.json && r.json.message));

    r = await api('POST', `/api/work-orders/${woId}/analyze`, pm);
    if (r.status !== 200) throw new Error('analyze: ' + r.status + ' ' + (r.json && r.json.message));

    r = await api('GET', `/api/work-orders/${woId}`, pm);
    if (r.status !== 200) throw new Error('detail: ' + r.status);
    const item = r.data.items.find((x) => x.title.toLowerCase() === kb.title.toLowerCase());
    if (!item) throw new Error('item missing in detail: got ' + JSON.stringify(r.data.items.map((x) => x.title)));

    const pass =
      item.classification_status === 'NON_FIRMWARE' &&
      item.complexity_code === 'L0' &&
      Number(item.estimated_hours) === 0;
    console.log('HTTP estimate state: status=' + item.classification_status +
      ' code=' + item.complexity_code +
      ' hours=' + Number(item.estimated_hours));
    if (!pass) {
      throw new Error('L0 not surfaced over HTTP: ' + JSON.stringify({
        classification_status: item.classification_status,
        complexity_code: item.complexity_code,
        estimated_hours: item.estimated_hours,
        estimation_total_hours: item.estimation_total_hours,
      }));
    }
    console.log('probe-l0-http: OK (estimate state shows L0 / 0h over HTTP, scratch WO removed)');
  } finally {
    if (woId) {
      await query(`DELETE FROM audit_trail WHERE entity_id = $1 AND entity_type IN ('WORK_ORDER', 'WORK_ORDER_ITEM')`, [woId]);
      await query(`DELETE FROM notifications WHERE entity_id = $1`, [woId]);
      await query(`DELETE FROM work_orders WHERE id = $1`, [woId]);
    }
    const left = await query(`SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1`, [WO]);
    if (left.rows[0].n !== 0) throw new Error('cleanup failed: scratch WO remains');
    await pool.end();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });