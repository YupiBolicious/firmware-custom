// Revert check: explicit production completion with zero docs -> 200, NO
// completed_without_documents key, audit details back to base shape. Full wipe after.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

async function api(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json };
}
async function q(sql, params) { return pool.query(sql, params); }
async function login(identifier, password) {
  const r = await api('POST', '/api/auth/login', undefined, { identifier, password });
  if (!r.data || !r.data.token) throw new Error('login failed ' + identifier);
  return r.data.token;
}

let pass = 0, fail = 0;
const fails = [];
function check(name, okc, detail) {
  if (okc) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name + (detail ? '  [' + detail + ']' : '')); console.log('FAIL ' + name + ' -> ' + detail); }
}

async function wipeWO(id) {
  const taskIds = (await q('SELECT id FROM production_tasks WHERE work_order_id=$1', [id])).rows.map((x) => x.id);
  await q('DELETE FROM work_order_documents WHERE work_order_id=$1', [id]);
  await q('DELETE FROM production_tasks WHERE work_order_id=$1', [id]);
  await q('DELETE FROM notifications WHERE entity_id=$1', [id]);
  await q('DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)', [id]);
  await q('DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1))', [id]);
  await q('DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)', [id]);
  await q('DELETE FROM work_order_items WHERE work_order_id=$1', [id]);
  await q('DELETE FROM work_order_groups WHERE work_order_id=$1', [id]);
  await q('DELETE FROM work_order_access WHERE work_order_id=$1', [id]);
  await q(`DELETE FROM audit_trail WHERE entity_type='WORK_ORDER' AND entity_id::text=$1`, [String(id)]);
  if (taskIds.length) await q(`DELETE FROM audit_trail WHERE entity_type='PRODUCTION_TASK' AND entity_id::text = ANY($1)`, [taskIds.map(String)]);
  await q('DELETE FROM work_orders WHERE id=$1', [id]);
}

(async () => {
  const ts = Date.now();
  const pm = await login('pm@demo', 'password123');
  const coder = await login('coder@demo', 'password123');
  for (const row of (await q(`SELECT id FROM work_orders WHERE wo_number LIKE 'WOREVERT-%'`)).rows) {
    await wipeWO(row.id);
  }
  const woNo = 'WOREVERT-' + ts;
  const r1 = await api('POST', '/api/work-orders', pm, {
    wo_number: woNo, title: 'Revert Test', description: 'worevert', customer: 'QA',
    groups: [{ machine_model_id: 1, machine_model_version_id: 1, serial_number: 'to support new' }],
  });
  if (r1.status !== 201) throw new Error('create failed ' + r1.status);
  const id = r1.data.id, groupId = r1.data.groups[0].id;
  const r2 = await api('POST', `/api/work-orders/${id}/items`, pm, { work_order_group_id: groupId, title: 'Write firmware for custom LCD panel driver update', quantity: 1 });
  if (r2.status !== 201) throw new Error('add item failed ' + r2.status);
  const r3 = await api('POST', `/api/work-orders/${id}/analyze`, pm);
  if (r3.status !== 200) throw new Error('analyze failed ' + r3.status);
  const cls = (await q(`SELECT c.status FROM classifications c JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1`, [id])).rows[0];
  if (!cls || cls.status !== 'CLASSIFIED') throw new Error('item not CLASSIFIED: ' + JSON.stringify(cls));
  const r4 = await api('POST', `/api/work-orders/${id}/finalize`, pm);
  if (r4.status !== 200) throw new Error('finalize failed ' + r4.status);
  const tasks = r4.data.production_tasks || [];
  if (!tasks.length) throw new Error('no production tasks');
  const r5 = await api('POST', `/api/work-orders/${id}/production`, coder);
  if (r5.status !== 200) throw new Error('startProduction failed ' + r5.status);

  let r = await api('POST', `/api/work-orders/${id}/production/complete`, coder);
  check('complete with open tasks -> 400', r.status === 400, 'status=' + r.status);
  for (const t of tasks) {
    await api('PUT', `/api/work-orders/${id}/production/tasks/${t.id}`, coder, { completed: true });
  }
  r = await api('POST', `/api/work-orders/${id}/production/complete`, coder);
  check('complete zero docs -> 200', r.status === 200, 'status=' + r.status);
  check('no completed_without_documents key', r.data && !('completed_without_documents' in r.data), JSON.stringify(Object.keys(r.data || {})));
  const aud = (await q(`SELECT details FROM audit_trail WHERE entity_type='WORK_ORDER' AND entity_id::text=$1 AND action='WORK_ORDER_COMPLETED' ORDER BY id DESC LIMIT 1`, [String(id)])).rows[0];
  check('audit details base shape (no flag fields)', aud && aud.details && aud.details.document_count === undefined && aud.details.completed_without_documents === undefined, JSON.stringify(aud && aud.details));

  await wipeWO(id);
  check('no WOREVERT rows', (await q(`SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE 'WOREVERT-%'`)).rows[0].c === 0, 'left');
  check('real user count = 4', (await q('SELECT COUNT(*)::int c FROM users')).rows[0].c === 4, 'c');
  const wo21 = (await q('SELECT status FROM work_orders WHERE id=21')).rows[0];
  check('WO-21 intact (DRAFT)', wo21 && wo21.status === 'DRAFT', JSON.stringify(wo21));

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log('  - ' + f)); }
  pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR:', e.message); pool.end(); process.exit(1); });
