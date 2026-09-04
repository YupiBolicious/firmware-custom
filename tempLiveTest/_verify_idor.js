// IDOR fix verification: GET /api/work-orders/:id/access now requires edit-level
// access (ADMIN / owner / grantee). Outsiders -> 403; grantee visibility kept.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

async function api(method, path, token, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json };
}
async function q(sql, params) { return pool.query(sql, params); }
async function login(identifier, password) {
  const r = await api('POST', '/api/auth/login', undefined, { identifier, password });
  if (!r.data || !r.data.token) throw new Error('login failed ' + identifier + ' status=' + r.status);
  return r.data.token;
}

let pass = 0, fail = 0;
const fails = [];
function check(name, okc, detail) {
  if (okc) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name + (detail ? '  [' + detail + ']' : '')); console.log('FAIL ' + name + ' -> ' + detail); }
}

(async () => {
  const admin = await login('admin@demo', 'password123');
  const pm = await login('pm@demo', 'password123');
  const coder = await login('coder@demo', 'password123');
  const maxNotifBefore = (await q('SELECT COALESCE(MAX(id),0)::int m FROM notifications')).rows[0].m;
  const maxAuditBefore = (await q('SELECT COALESCE(MAX(id),0)::int m FROM audit_trail')).rows[0].m;

  // Precondition: coder has no grant on WO-21
  const pre = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21 AND user_id=2')).rows[0].c;
  check('precondition: coder has no grant on WO-21', pre === 0, 'c=' + pre);

  // 1. Outsider (coder, no grant) lists -> 403 (was 200 before fix)
  let r = await api('GET', '/api/work-orders/21/access', coder);
  check('outsider list -> 403', r.status === 403, 'status=' + r.status);

  // 2. Owner grants coder -> 200
  r = await api('POST', '/api/work-orders/21/access', pm, { user_id: 2 });
  check('owner grants coder -> 200', r.status === 200, 'status=' + r.status);

  // 3. Grantee lists -> 200 (visibility preserved)
  r = await api('GET', '/api/work-orders/21/access', coder);
  check('grantee list -> 200', r.status === 200 && Array.isArray(r.data), 'status=' + r.status);

  // 4. Owner + admin list -> 200
  r = await api('GET', '/api/work-orders/21/access', pm);
  check('owner list -> 200', r.status === 200, 'status=' + r.status);
  r = await api('GET', '/api/work-orders/21/access', admin);
  check('admin list -> 200', r.status === 200, 'status=' + r.status);

  // 5. Owner revokes coder -> 200; coder lists again -> 403
  r = await api('DELETE', '/api/work-orders/21/access/2', pm);
  check('owner revokes coder -> 200', r.status === 200, 'status=' + r.status);
  r = await api('GET', '/api/work-orders/21/access', coder);
  check('ex-grantee list -> 403', r.status === 403, 'status=' + r.status);

  // Cleanup: restore WO-21 baseline (0 grants, no test notifications/audit)
  await q(`DELETE FROM notifications WHERE entity_id=21 AND id>$1`, [maxNotifBefore]);
  await q(`DELETE FROM audit_trail WHERE entity_type='WORK_ORDER' AND entity_id::text='21' AND id>$1`, [maxAuditBefore]);
  const grants = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21')).rows[0].c;
  check('WO-21 grants baseline (0)', grants === 0, 'c=' + grants);
  const leftN = (await q(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=21 AND id>$1`, [maxNotifBefore])).rows[0].c;
  check('WO-21 test notifications cleaned', leftN === 0, 'c=' + leftN);

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log('  - ' + f)); }
  pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR:', e.message); pool.end(); process.exit(1); });
