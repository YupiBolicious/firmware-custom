// ADMIN Side QA/QC Smoke Test
// Covers: admin-dashboard, user management, complexity levels, KB (incl. hard
// DELETE), machine models + versions, audit-log RBAC, ADMIN-only 403 probes,
// wrong-input 400/409. Settles DB reads, then FULL cleanup of scratch rows.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

async function api(method, path, token, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
async function q(sql, params) { return pool.query(sql, params); }
async function login(identifier, password) {
  const r = await api('POST', '/api/auth/login', undefined, { identifier, password });
  if (!r.data || !r.data.token) throw new Error('login failed ' + identifier);
  return r.data.token;
}

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; fails.push(name + (detail ? '  [' + detail + ']' : '')); console.log('FAIL ' + name + ' -> ' + detail); }
}
function ok(name, r, want) {
  check(name + ' -> ' + want, r.status === want, 'status=' + r.status + (r.json && r.json.message ? ' msg=' + r.json.message : ''));
}

(async () => {
  const ts = Date.now();
  const admin = await login('admin@demo', 'password123');
  const pm = await login('pm@demo', 'password123');
  const coder = await login('coder@demo', 'password123');

  const scratch = { userIds: [], cxIds: [], kbIds: [], modelIds: [], verIds: [] };
  const email = `admtest-${ts}@example.com`;
  const username = `admtest-${ts}`;
  const cxCode = `ADMT${String(ts).slice(-6)}`;
  const kbCode = `ADMKB-${ts}`;
  const modelCode = `ADMM-${ts}`;
  const verCode = `ADMV-${ts}`;

  // ================= A. ADMIN DASHBOARD =================
  console.log('\n===== A. admin-dashboard =====');
  let r = await api('GET', '/api/admin-dashboard', admin);
  ok('dashboard admin 200', r, 200);
  check('dashboard shape (kpis/health/users/classification/config/trend)',
    !!r.data && !!r.data.kpis && !!r.data.health && !!r.data.users && !!r.data.classification && !!r.data.config && !!r.data.trend,
    'keys=' + (r.data ? Object.keys(r.data).join(',') : 'none'));
  check('dashboard kpis sane (total_users>=4)', r.data && r.data.kpis && r.data.kpis.total_users >= 4, JSON.stringify(r.data && r.data.kpis));
  check('dashboard health online', r.data && r.data.health && r.data.health.api === 'online' && r.data.health.database === 'online', JSON.stringify(r.data && r.data.health));

  r = await api('GET', '/api/admin-dashboard?from=2026-07-01&to=2026-09-03', admin);
  ok('dashboard range 200', r, 200);
  check('dashboard granularity present', !!r.data && !!r.data.trend && !!r.data.trend.granularity, 'gran=' + (r.data && r.data.trend && r.data.trend.granularity));
  check('dashboard buckets array', Array.isArray(r.data && r.data.trend && r.data.trend.buckets), 'n=' + (r.data && r.data.trend && r.data.trend.buckets && r.data.trend.buckets.length));

  r = await api('GET', '/api/admin-dashboard?from=not-a-date', admin);
  ok('dashboard bad from 400', r, 400);
  r = await api('GET', '/api/admin-dashboard?to=2026-13-99', admin);
  ok('dashboard bad to 400', r, 400);
  r = await api('GET', '/api/admin-dashboard', pm);
  ok('dashboard pm 403', r, 403);
  r = await api('GET', '/api/admin-dashboard', coder);
  ok('dashboard coder 403', r, 403);
  r = await api('GET', '/api/admin-dashboard', undefined);
  ok('dashboard unauth 401', r, 401);

  // ================= B. USER MANAGEMENT =================
  console.log('\n===== B. users =====');
  r = await api('GET', '/api/users', admin);
  ok('list users admin 200', r, 200);
  check('list contains admin@demo', Array.isArray(r.data) && r.data.some((u) => u.username === 'admin@demo' || u.email === 'admin@demo.com'), 'n=' + (r.data && r.data.length));
  const usersBefore = (await q('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  r = await api('GET', '/api/users', pm);
  ok('list users pm 403', r, 403);
  r = await api('GET', '/api/users', coder);
  ok('list users coder 403', r, 403);
  r = await api('GET', '/api/users', undefined);
  ok('list users unauth 401', r, 401);

  r = await api('GET', '/api/users/pm', admin);
  ok('list pm-users admin 200', r, 200);
  r = await api('GET', '/api/users/pm', pm);
  ok('list pm-users pm 200', r, 200);
  check('pm list all have PM role', Array.isArray(r.data) && r.data.length > 0 && r.data.every((u) => (u.roles || []).includes('PM')), 'n=' + (r.data && r.data.length));
  r = await api('GET', '/api/users/pm', coder);
  ok('list pm-users coder 403', r, 403);

  // create scratch user
  r = await api('POST', '/api/users', admin, { email, username, roles: ['PM'], default_password: 'Testpass123', full_name: 'ADM Test User' });
  ok('create user 201', r, 201);
  const uid = r.data && r.data.id;
  check('created user id', !!uid, 'id=' + uid);
  if (uid) scratch.userIds.push(uid);
  const dbU = (await q('SELECT id, email, username, full_name, is_active FROM users WHERE id=$1', [uid])).rows[0];
  check('DB user row (email lower)', dbU && dbU.email === email.toLowerCase(), JSON.stringify(dbU));
  const dbRoles = (await q(`SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 ORDER BY 1`, [uid])).rows.map((x) => x.code);
  check('DB user_roles = [PM]', JSON.stringify(dbRoles) === JSON.stringify(['PM']), JSON.stringify(dbRoles));
  const auditCreated = (await q(`SELECT COUNT(*)::int c FROM audit_trail WHERE entity_type='USER' AND entity_id::text=$1 AND action='USER_CREATED'`, [String(uid)])).rows[0].c;
  check('audit USER_CREATED', auditCreated >= 1, 'c=' + auditCreated);

  // duplicates
  r = await api('POST', '/api/users', admin, { email, username: `other-${ts}`, roles: ['PM'], default_password: 'Testpass123', full_name: 'Dup' });
  ok('create dup email 409', r, 409);
  r = await api('POST', '/api/users', admin, { email: `other-${ts}@example.com`, username, roles: ['PM'], default_password: 'Testpass123', full_name: 'Dup' });
  ok('create dup username 409', r, 409);
  r = await api('POST', '/api/users', admin, { email: 'pm@demo.com', username: `other2-${ts}`, roles: ['PM'], default_password: 'Testpass123', full_name: 'Dup' });
  ok('create existing email 409', r, 409);

  // wrong inputs
  const badCreates = [
    ['bad email', { email: 'not-an-email', username: `b1-${ts}`, roles: ['PM'], default_password: 'Testpass123', full_name: 'X' }],
    ['short username', { email: `b2-${ts}@example.com`, username: 'ab', roles: ['PM'], default_password: 'Testpass123', full_name: 'X' }],
    ['bad username chars', { email: `b3-${ts}@example.com`, username: 'bad name!', roles: ['PM'], default_password: 'Testpass123', full_name: 'X' }],
    ['missing roles', { email: `b4-${ts}@example.com`, username: `b4-${ts}`, default_password: 'Testpass123', full_name: 'X' }],
    ['bad role', { email: `b5-${ts}@example.com`, username: `b5-${ts}`, roles: ['SUPER'], default_password: 'Testpass123', full_name: 'X' }],
    ['short password', { email: `b6-${ts}@example.com`, username: `b6-${ts}`, roles: ['PM'], default_password: 'short', full_name: 'X' }],
    ['missing full_name', { email: `b7-${ts}@example.com`, username: `b7-${ts}`, roles: ['PM'], default_password: 'Testpass123' }],
  ];
  for (const [label, body] of badCreates) {
    r = await api('POST', '/api/users', admin, body);
    ok('create ' + label + ' 400', r, 400);
  }
  r = await api('POST', '/api/users', pm, { email: `pmx-${ts}@example.com`, username: `pmx-${ts}`, roles: ['PM'], default_password: 'Testpass123', full_name: 'X' });
  ok('create user pm 403', r, 403);

  // update
  r = await api('PUT', `/api/users/${uid}`, admin, { full_name: 'ADM Renamed', roles: ['CODER'] });
  ok('update user 200', r, 200);
  const dbU2 = (await q('SELECT full_name FROM users WHERE id=$1', [uid])).rows[0];
  check('DB full_name updated', dbU2 && dbU2.full_name === 'ADM Renamed', dbU2 && dbU2.full_name);
  const dbRoles2 = (await q(`SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1 ORDER BY 1`, [uid])).rows.map((x) => x.code);
  check('DB roles replaced to [CODER]', JSON.stringify(dbRoles2) === JSON.stringify(['CODER']), JSON.stringify(dbRoles2));
  const badUpdates = [
    ['bad username', { username: 'x' }],
    ['empty full_name', { full_name: '   ' }],
    ['bad roles', { roles: ['NOPE'] }],
    ['is_active string', { is_active: 'yes' }],
  ];
  for (const [label, body] of badUpdates) {
    r = await api('PUT', `/api/users/${uid}`, admin, body);
    ok('update ' + label + ' 400', r, 400);
  }
  r = await api('PUT', '/api/users/999999999', admin, { full_name: 'Ghost' });
  ok('update nonexistent 404', r, 404);
  r = await api('PUT', '/api/users/abc', admin, { full_name: 'Ghost' });
  ok('update id abc 400', r, 400);
  r = await api('PUT', `/api/users/${uid}`, pm, { full_name: 'Hack' });
  ok('update user pm 403', r, 403);

  // reset password
  r = await api('POST', `/api/users/${uid}/reset-password`, admin, { new_password: 'Newpass456' });
  ok('reset password 200', r, 200);
  const canLoginNew = await (async () => {
    try { await login(email, 'Newpass456'); return true; } catch (e) { return false; }
  })();
  check('login with new password works', canLoginNew === true, 'ok=' + canLoginNew);
  r = await api('POST', `/api/users/${uid}/reset-password`, admin, { new_password: 'short' });
  ok('reset short pwd 400', r, 400);
  r = await api('POST', '/api/users/999999999/reset-password', admin, { new_password: 'Newpass456' });
  ok('reset nonexistent 404', r, 404);
  r = await api('POST', '/api/users/abc/reset-password', admin, { new_password: 'Newpass456' });
  ok('reset id abc 400', r, 400);
  r = await api('POST', `/api/users/${uid}/reset-password`, pm, { new_password: 'Newpass456' });
  ok('reset pm 403', r, 403);

  // deactivate -> login blocked
  r = await api('PUT', `/api/users/${uid}`, admin, { is_active: false });
  ok('deactivate user 200', r, 200);
  const blockedLogin = await (async () => {
    try { await login(email, 'Newpass456'); return false; } catch (e) { return true; }
  })();
  check('deactivated user login blocked', blockedLogin === true, 'blocked=' + blockedLogin);

  // ================= C. COMPLEXITY =================
  console.log('\n===== C. complexity-levels =====');
  r = await api('GET', '/api/complexity-levels', admin);
  ok('list complexity admin 200', r, 200);
  check('complexity list has L0-L5', Array.isArray(r.data) && ['L0','L1','L2','L3','L4','L5'].every((c) => r.data.some((x) => x.code === c)), 'n=' + (r.data && r.data.length));
  r = await api('GET', '/api/complexity-levels', pm);
  ok('list complexity pm 200', r, 200);
  r = await api('GET', '/api/complexity-levels', coder);
  ok('list complexity coder 200', r, 200);

  r = await api('POST', '/api/complexity-levels', admin, { code: cxCode, name: 'ADM Test Level', requirement_review_h: 1, code_development_h: 2 });
  ok('create complexity 201', r, 201);
  const cxId = r.data && r.data.id;
  if (cxId) scratch.cxIds.push(cxId);
  const dbCx = (await q('SELECT code, name, requirement_review_h FROM complexity_levels WHERE id=$1', [cxId])).rows[0];
  check('DB complexity row', dbCx && dbCx.code === cxCode && dbCx.name === 'ADM Test Level', JSON.stringify(dbCx));
  r = await api('POST', '/api/complexity-levels', admin, { code: cxCode, name: 'Dup' });
  ok('create complexity dup 409', r, 409);
  r = await api('POST', '/api/complexity-levels', admin, { code: cxCode.toLowerCase(), name: 'Dup lower' });
  ok('create complexity dup lower 409', r, 409);
  r = await api('POST', '/api/complexity-levels', admin, { code: 'L0', name: 'Dup L0' });
  ok('create complexity existing L0 409', r, 409);
  const badCx = [
    ['missing code', { name: 'No code' }],
    ['missing name', { code: 'ADMX9' }],
    ['negative hours', { code: 'ADMX9', name: 'Neg', code_development_h: -1 }],
    ['nan hours', { code: 'ADMX9', name: 'NaN', code_development_h: 'abc' }],
  ];
  for (const [label, body] of badCx) {
    r = await api('POST', '/api/complexity-levels', admin, body);
    ok('create complexity ' + label + ' 400', r, 400);
  }
  r = await api('POST', '/api/complexity-levels', pm, { code: 'ADMPM', name: 'PM try' });
  ok('create complexity pm 403', r, 403);

  r = await api('GET', `/api/complexity-levels/${cxId}`, admin);
  ok('get complexity 200', r, 200);
  r = await api('GET', '/api/complexity-levels/999999999', admin);
  ok('get complexity 404', r, 404);
  r = await api('GET', '/api/complexity-levels/abc', admin);
  ok('get complexity abc 400', r, 400);
  r = await api('PUT', `/api/complexity-levels/${cxId}`, admin, { name: 'ADM Renamed' });
  ok('update complexity 200', r, 200);
  const dbCx2 = (await q('SELECT name FROM complexity_levels WHERE id=$1', [cxId])).rows[0];
  check('DB complexity renamed', dbCx2 && dbCx2.name === 'ADM Renamed', dbCx2 && dbCx2.name);
  r = await api('PUT', `/api/complexity-levels/${cxId}`, admin, { code: 'L1' });
  ok('update complexity dup code 409', r, 409);
  r = await api('PUT', '/api/complexity-levels/abc', admin, { name: 'x' });
  ok('update complexity abc 400', r, 400);
  r = await api('PUT', '/api/complexity-levels/999999999', admin, { name: 'x' });
  ok('update complexity 404', r, 404);
  r = await api('PUT', `/api/complexity-levels/${cxId}`, pm, { name: 'Hack' });
  ok('update complexity pm 403', r, 403);
  r = await api('DELETE', `/api/complexity-levels/${cxId}`, admin);
  ok('delete complexity 200', r, 200);
  const dbCxDel = (await q('SELECT is_active FROM complexity_levels WHERE id=$1', [cxId])).rows[0];
  check('DB complexity soft-deactivated', dbCxDel && dbCxDel.is_active === false, JSON.stringify(dbCxDel));
  r = await api('DELETE', '/api/complexity-levels/999999999', admin);
  ok('delete complexity 404', r, 404);
  r = await api('DELETE', `/api/complexity-levels/${cxId}`, pm);
  ok('delete complexity pm 403', r, 403);

  // ================= D. KNOWLEDGE BASE =================
  console.log('\n===== D. kb =====');
  r = await api('GET', '/api/kb', admin);
  ok('list kb admin 200', r, 200);
  check('kb list non-empty', Array.isArray(r.data) && r.data.length > 0, 'n=' + (r.data && r.data.length));
  r = await api('GET', '/api/kb', pm);
  ok('list kb pm 403', r, 403);
  r = await api('GET', '/api/kb', coder);
  ok('list kb coder 403', r, 403);

  r = await api('POST', '/api/kb', admin, { kb_code: kbCode, title: 'ADM Test KB Item', description: 'smoke', keywords: 'adm,test', fw_related: true, complexity_level_id: 3, confidence_score: 90 });
  ok('create kb 201', r, 201);
  const kbId = r.data && r.data.id;
  if (kbId) scratch.kbIds.push(kbId);
  const dbKb = (await q('SELECT kb_code, title, fw_related FROM kb_items WHERE id=$1', [kbId])).rows[0];
  check('DB kb row', dbKb && dbKb.kb_code === kbCode, JSON.stringify(dbKb));
  r = await api('POST', '/api/kb', admin, { kb_code: kbCode, title: 'Dup', fw_related: true, complexity_level_id: 3, confidence_score: 90 });
  ok('create kb dup 409', r, 409);
  r = await api('POST', '/api/kb', admin, { title: 'No code', fw_related: true, complexity_level_id: 3, confidence_score: 90 });
  ok('create kb missing kb_code 400', r, 400);
  r = await api('POST', '/api/kb', admin, { kb_code: `ADMKB2-${ts}`, fw_related: true, complexity_level_id: 3, confidence_score: 90 });
  ok('create kb missing title 400', r, 400);
  r = await api('POST', '/api/kb', admin, { kb_code: `ADMKB3-${ts}`, title: 'Bad FK', fw_related: true, complexity_level_id: 999999, confidence_score: 90 });
  ok('create kb bad complexity FK 400', r, 400);
  r = await api('POST', '/api/kb', pm, { kb_code: `ADMKB4-${ts}`, title: 'PM try', fw_related: true, complexity_level_id: 3, confidence_score: 90 });
  ok('create kb pm 403', r, 403);

  r = await api('GET', `/api/kb/${kbId}`, admin);
  ok('get kb 200', r, 200);
  r = await api('GET', '/api/kb/999999999', admin);
  ok('get kb 404', r, 404);
  r = await api('GET', '/api/kb/abc', admin);
  ok('get kb abc 400', r, 400);
  r = await api('PUT', `/api/kb/${kbId}`, admin, { kb_code: kbCode, title: 'ADM Test KB Renamed', description: 'smoke', keywords: 'adm,test', fw_related: true, complexity_level_id: 3, confidence_score: 91, is_active: true });
  ok('update kb 200', r, 200);
  const dbKb2 = (await q('SELECT title, confidence_score FROM kb_items WHERE id=$1', [kbId])).rows[0];
  check('DB kb updated', dbKb2 && dbKb2.title === 'ADM Test KB Renamed', JSON.stringify(dbKb2));
  r = await api('PUT', '/api/kb/999999999', admin, { kb_code: 'X', title: 'X', fw_related: true, complexity_level_id: 3, confidence_score: 90, is_active: true });
  ok('update kb 404', r, 404);
  r = await api('PUT', '/api/kb/abc', admin, { kb_code: 'X', title: 'X', fw_related: true, complexity_level_id: 3, confidence_score: 90, is_active: true });
  ok('update kb abc 400', r, 400);

  // kb test endpoint (jaccard)
  r = await api('POST', `/api/kb/${kbId}/test`, admin, { sample_text: 'adm test kb item' });
  ok('kb test 200', r, 200);
  check('kb test shape (verdict/score)', !!r.data && r.data.verdict !== undefined && typeof r.data.score === 'number', JSON.stringify(r.data && { verdict: r.data.verdict, score: r.data.score }));
  r = await api('POST', `/api/kb/${kbId}/test`, admin, {});
  ok('kb test missing sample 400', r, 400);
  r = await api('POST', '/api/kb/999999999/test', admin, { sample_text: 'hello' });
  ok('kb test nonexistent 404', r, 404);
  r = await api('POST', `/api/kb/${kbId}/test`, pm, { sample_text: 'hello' });
  ok('kb test pm 403', r, 403);

  // hard delete (approved)
  r = await api('DELETE', `/api/kb/${kbId}`, admin);
  ok('delete kb 200 (hard)', r, 200);
  const dbKbDel = (await q('SELECT COUNT(*)::int c FROM kb_items WHERE id=$1', [kbId])).rows[0].c;
  check('DB kb hard-deleted (gone)', dbKbDel === 0, 'c=' + dbKbDel);
  scratch.kbIds = scratch.kbIds.filter((x) => x !== kbId);
  r = await api('GET', `/api/kb/${kbId}`, admin);
  ok('get kb after delete 404', r, 404);
  r = await api('DELETE', `/api/kb/${kbId}`, admin);
  ok('delete kb again 404', r, 404);
  r = await api('DELETE', '/api/kb/abc', admin);
  ok('delete kb abc 400', r, 400);

  // ================= E. MACHINE MODELS =================
  console.log('\n===== E. machine-models =====');
  r = await api('GET', '/api/machine-models', admin);
  ok('list models admin 200', r, 200);
  check('models list has MM-1000', Array.isArray(r.data) && r.data.some((m) => m.model_code === 'MM-1000'), 'n=' + (r.data && r.data.length));
  r = await api('GET', '/api/machine-models', pm);
  ok('list models pm 403', r, 403);
  r = await api('GET', '/api/machine-models', coder);
  ok('list models coder 403', r, 403);

  r = await api('POST', '/api/machine-models', admin, { model_code: modelCode, name: 'ADM Test Model', description: 'smoke' });
  ok('create model 201', r, 201);
  const modelId = r.data && r.data.id;
  if (modelId) scratch.modelIds.push(modelId);
  const dbM = (await q('SELECT model_code, is_active FROM machine_model WHERE id=$1', [modelId])).rows[0];
  check('DB model row active', dbM && dbM.model_code === modelCode && dbM.is_active === true, JSON.stringify(dbM));
  r = await api('POST', '/api/machine-models', admin, { model_code: modelCode, name: 'Dup' });
  ok('create model dup 409', r, 409);
  r = await api('POST', '/api/machine-models', admin, { name: 'No code' });
  ok('create model missing code 400', r, 400);
  r = await api('POST', '/api/machine-models', pm, { model_code: `PMM-${ts}`, name: 'PM try' });
  ok('create model pm 403', r, 403);

  r = await api('GET', `/api/machine-models/${modelId}`, admin);
  ok('get model 200', r, 200);
  check('get model has versions array', !!r.data && Array.isArray(r.data.versions), 'versions=' + (r.data && r.data.versions && r.data.versions.length));
  r = await api('GET', '/api/machine-models/999999999', admin);
  ok('get model 404', r, 404);
  r = await api('GET', '/api/machine-models/abc', admin);
  ok('get model abc 400', r, 400);
  r = await api('PUT', `/api/machine-models/${modelId}`, admin, { name: 'ADM Renamed Model' });
  ok('update model 200', r, 200);
  const dbM2 = (await q('SELECT name FROM machine_model WHERE id=$1', [modelId])).rows[0];
  check('DB model renamed', dbM2 && dbM2.name === 'ADM Renamed Model', dbM2 && dbM2.name);
  r = await api('PUT', '/api/machine-models/999999999', admin, { name: 'x' });
  ok('update model 404', r, 404);
  r = await api('PUT', '/api/machine-models/abc', admin, { name: 'x' });
  ok('update model abc 400', r, 400);

  // versions
  r = await api('POST', `/api/machine-models/${modelId}/versions`, admin, { version_code: verCode, description: 'smoke v' });
  ok('create version 201', r, 201);
  const verId = r.data && r.data.id;
  if (verId) scratch.verIds.push(verId);
  r = await api('POST', `/api/machine-models/${modelId}/versions`, admin, { version_code: verCode });
  ok('create version dup 409', r, 409);
  r = await api('POST', '/api/machine-models/999999999/versions', admin, { version_code: 'VX' });
  ok('create version bad model 404', r, 404);
  r = await api('POST', '/api/machine-models/abc/versions', admin, { version_code: 'VX' });
  ok('create version abc 400', r, 400);
  r = await api('GET', `/api/machine-models/${modelId}/versions`, admin);
  ok('list versions 200', r, 200);
  check('versions contains created', Array.isArray(r.data) && r.data.some((v) => v.id === verId), 'n=' + (r.data && r.data.length));
  r = await api('PUT', `/api/machine-models/versions/${verId}`, admin, { description: 'smoke v2' });
  ok('update version 200', r, 200);
  const dbV = (await q('SELECT description FROM machine_model_ver WHERE id=$1', [verId])).rows[0];
  check('DB version updated', dbV && dbV.description === 'smoke v2', dbV && dbV.description);
  r = await api('PUT', '/api/machine-models/versions/999999999', admin, { description: 'x' });
  ok('update version 404', r, 404);
  r = await api('PUT', '/api/machine-models/versions/abc', admin, { description: 'x' });
  ok('update version abc 400', r, 400);
  r = await api('DELETE', `/api/machine-models/versions/${verId}`, admin);
  ok('delete version 200', r, 200);
  const dbVDel = (await q('SELECT is_active FROM machine_model_ver WHERE id=$1', [verId])).rows[0];
  check('DB version soft-deactivated', dbVDel && dbVDel.is_active === false, JSON.stringify(dbVDel));
  r = await api('GET', `/api/machine-models/${modelId}/versions`, admin);
  check('deleted version excluded from list', Array.isArray(r.data) && !r.data.some((v) => v.id === verId), 'n=' + (r.data && r.data.length));
  scratch.verIds = scratch.verIds.filter((x) => x !== verId);

  r = await api('DELETE', `/api/machine-models/${modelId}`, admin);
  ok('delete model 200', r, 200);
  const dbMDel = (await q('SELECT is_active FROM machine_model WHERE id=$1', [modelId])).rows[0];
  check('DB model soft-deactivated', dbMDel && dbMDel.is_active === false, JSON.stringify(dbMDel));
  r = await api('GET', '/api/machine-models', admin);
  check('deleted model excluded from list', Array.isArray(r.data) && !r.data.some((m) => m.id === modelId), 'n=' + (r.data && r.data.length));
  r = await api('DELETE', '/api/machine-models/999999999', admin);
  ok('delete model 404', r, 404);
  r = await api('DELETE', '/api/machine-models/abc', admin);
  ok('delete model abc 400', r, 400);

  // ================= F. AUDIT LOG =================
  console.log('\n===== F. audit-log =====');
  r = await api('GET', '/api/audit-log', admin);
  ok('audit admin 200', r, 200);
  check('audit shape (items/actions/users)', !!r.data && Array.isArray(r.data.items) && Array.isArray(r.data.actions) && Array.isArray(r.data.users), 'keys=' + (r.data ? Object.keys(r.data).join(',') : 'none'));
  r = await api('GET', '/api/audit-log', pm);
  ok('audit pm 200', r, 200);
  r = await api('GET', '/api/audit-log', coder);
  ok('audit coder 200', r, 200);
  r = await api('GET', '/api/audit-log?limit=5', admin);
  ok('audit limit=5 200', r, 200);
  check('audit limit respected', r.data && r.data.items && r.data.items.length <= 5, 'n=' + (r.data && r.data.items && r.data.items.length));
  for (const [label, qs] of [['abc', '?limit=abc'], ['zero', '?limit=0'], ['over max', '?limit=1001']]) {
    r = await api('GET', '/api/audit-log' + qs, admin);
    ok('audit limit ' + label + ' 400', r, 400);
  }
  r = await api('GET', '/api/audit-log', undefined);
  ok('audit unauth 401', r, 401);

  // ================= G. CLEANUP =================
  console.log('\n===== G. cleanup =====');
  // audit rows scoped to scratch users
  for (const id of scratch.userIds) {
    await q(`DELETE FROM audit_trail WHERE entity_type='USER' AND entity_id::text=$1`, [String(id)]);
    await q(`DELETE FROM user_roles WHERE user_id=$1`, [id]);
    await q(`DELETE FROM users WHERE id=$1`, [id]);
  }
  for (const id of scratch.cxIds) await q(`DELETE FROM complexity_levels WHERE id=$1`, [id]);
  for (const id of scratch.kbIds) await q(`DELETE FROM kb_items WHERE id=$1`, [id]);
  for (const id of scratch.verIds) await q(`DELETE FROM machine_model_ver WHERE id=$1`, [id]);
  for (const id of scratch.modelIds) await q(`DELETE FROM machine_model WHERE id=$1`, [id]);

  const leftU = (await q(`SELECT COUNT(*)::int c FROM users WHERE email LIKE 'admtest-%@example.com'`, [])).rows[0].c;
  check('no scratch users remain', leftU === 0, 'c=' + leftU);
  const leftCx = (await q(`SELECT COUNT(*)::int c FROM complexity_levels WHERE code LIKE 'ADMT%'`, [])).rows[0].c;
  check('no scratch complexity remain', leftCx === 0, 'c=' + leftCx);
  const leftKb = (await q(`SELECT COUNT(*)::int c FROM kb_items WHERE kb_code LIKE 'ADMKB%'`, [])).rows[0].c;
  check('no scratch KB remain', leftKb === 0, 'c=' + leftKb);
  const leftM = (await q(`SELECT COUNT(*)::int c FROM machine_model WHERE model_code LIKE 'ADMM-%'`, [])).rows[0].c;
  check('no scratch models remain', leftM === 0, 'c=' + leftM);
  const leftV = (await q(`SELECT COUNT(*)::int c FROM machine_model_ver WHERE version_code LIKE 'ADMV-%'`, [])).rows[0].c;
  check('no scratch versions remain', leftV === 0, 'c=' + leftV);
  const leftAudit = (await q(`SELECT COUNT(*)::int c FROM audit_trail WHERE entity_type='USER' AND entity_id::text = ANY($1)`, [scratch.userIds.map(String)])).rows[0].c;
  check('no scratch user audit remain', leftAudit === 0, 'c=' + leftAudit);

  // real data integrity
  const usersNow = (await q('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  check('real user count unchanged', usersNow === usersBefore, 'before=' + usersBefore + ' now=' + usersNow);
  const realCx = (await q(`SELECT COUNT(*)::int c FROM complexity_levels WHERE code IN ('L0','L1','L2','L3','L4','L5')`)).rows[0].c;
  check('real complexity L0-L5 intact', realCx === 6, 'c=' + realCx);
  const realModel = (await q('SELECT COUNT(*)::int c FROM machine_model WHERE id=1')).rows[0].c;
  check('real model id=1 intact', realModel === 1, 'c=' + realModel);
  const realKb = (await q('SELECT COUNT(*)::int c FROM kb_items WHERE id=1')).rows[0].c;
  check('real kb id=1 intact', realKb === 1, 'c=' + realKb);

  console.log('\n=== ' + pass + ' PASS / ' + fail + ' FAIL ===');
  if (fails.length) { console.log('FAILED:'); fails.forEach((l) => console.log('  - ' + l)); }
  require('fs').writeFileSync('C:/Program Files/Firmware Custom/tempLiveTest/_admin-results.json',
    JSON.stringify({ pass, fail, fails, ts }, null, 2));
  pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });
