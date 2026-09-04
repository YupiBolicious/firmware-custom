// Self-deactivation guard verification: self-deactivate requires >1 active ADMIN.
// Scratch ADMINs A+B created, exercised, then fully wiped via DB.
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
  const ts = Date.now();
  const admin = await login('admin@demo', 'password123');
  const mkUser = async (tag) => {
    const r = await api('POST', '/api/users', admin, {
      email: `selfguard-${tag}-${ts}@example.com`,
      username: `selfguard_${tag}_${ts}`,
      roles: ['ADMIN'],
      default_password: 'GuardTest123',
      full_name: `Self Guard ${tag}`,
    });
    if (r.status !== 201) throw new Error('create scratch failed ' + r.status + ' ' + JSON.stringify(r.json));
    return r.data;
  };
  const A = await mkUser('a');
  const B = await mkUser('b');
  const ids = [A.id, B.id];
  check('scratch A+B created', !!A.id && !!B.id, JSON.stringify([A.id, B.id]));
  try {
    const tokenA = await login(`selfguard-a-${ts}@example.com`, 'GuardTest123');
    check('scratch A login works', !!tokenA, '');

    // 1. A self-deactivates while 3 active ADMINs exist -> allowed (200)
    let r = await api('PUT', `/api/users/${A.id}`, tokenA, { is_active: false });
    check('A self-deactivate with 3 admins -> 200', r.status === 200, 'status=' + r.status + ' msg=' + (r.json && r.json.message));
    let row = (await q('SELECT is_active FROM users WHERE id=$1', [A.id])).rows[0];
    check('DB A is_active=false', row && row.is_active === false, JSON.stringify(row));

    // 2. Real admin reactivates A -> 200
    r = await api('PUT', `/api/users/${A.id}`, admin, { is_active: true });
    check('admin reactivates A -> 200', r.status === 200, 'status=' + r.status);

    // 3. Other-deactivation still allowed: admin deactivates B, then A
    r = await api('PUT', `/api/users/${B.id}`, admin, { is_active: false });
    check('admin deactivates B (other) -> 200', r.status === 200, 'status=' + r.status);
    r = await api('PUT', `/api/users/${A.id}`, admin, { is_active: false });
    check('admin deactivates A (other) -> 200', r.status === 200, 'status=' + r.status);

    // 4. Only real admin remains active -> self-deactivate must be blocked 400
    const cnt = (await q(`SELECT COUNT(DISTINCT u.id)::int c FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='ADMIN' AND u.is_active=TRUE`)).rows[0].c;
    check('precondition: 1 active admin left', cnt === 1, 'count=' + cnt);
    r = await api('PUT', '/api/users/3', admin, { is_active: false });
    check('real admin self-deactivate sole-admin -> 400', r.status === 400, 'status=' + r.status + ' msg=' + (r.json && r.json.message));
    row = (await q('SELECT is_active FROM users WHERE id=3')).rows[0];
    check('DB real admin still active', row && row.is_active === true, JSON.stringify(row));
    const t = await login('admin@demo', 'password123');
    check('real admin login still works', !!t, '');
  } finally {
    // Cleanup: audit rows first (FK audit_trail.user_id -> users), then roles, then users
    await q(`DELETE FROM audit_trail WHERE entity_type='USER' AND entity_id::text = ANY($1)`, [ids.map(String)]).catch(() => {});
    await q(`DELETE FROM audit_trail WHERE user_id = ANY($1)`, [ids]).catch(() => {});
    for (const id of ids) {
      await q('DELETE FROM user_roles WHERE user_id=$1', [id]).catch(() => {});
      await q('DELETE FROM users WHERE id=$1', [id]).catch(() => {});
    }
    const left = (await q(`SELECT COUNT(*)::int c FROM users WHERE email LIKE $1`, [`selfguard-%-${ts}@example.com`])).rows[0].c;
    check('no scratch users remain', left === 0, 'left=' + left);
    const total = (await q('SELECT COUNT(*)::int c FROM users')).rows[0].c;
    check('real user count = 4', total === 4, 'total=' + total);
  }
  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log('  - ' + f)); }
  pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR:', e.message); pool.end(); process.exit(1); });
