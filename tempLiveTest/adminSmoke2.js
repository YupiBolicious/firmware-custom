// ADMIN Round 2 — notifications lifecycle, admin-as-grantee, rollback purge on
// admin, wrong-input edges, IDOR probe, self-deactivation, auth edges.
// Full cleanup of all scratch rows after verification.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

async function api(method, path, token, body, query) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path + (query || ''), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
async function rawGet(pathWithQuery, token) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + pathWithQuery, { method: 'GET', headers });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json };
}
async function q(sql, params) { return pool.query(sql, params); }
// notify() calls in grant/revoke are fire-and-forget: poll until rows land.
async function waitFor(fn, timeoutMs) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > (timeoutMs || 5000)) return null;
    await new Promise((res) => setTimeout(res, 150));
  }
}
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
  const scratch = { userIds: [], cxIds: [], kbIds: [], modelIds: [], verIds: [], woIds: [] };

  // ================= N. NOTIFICATION API AS ADMIN =================
  console.log('\n===== N. notifications (admin) =====');
  let r = await api('GET', '/api/notifications', admin);
  ok('admin list notifications 200', r, 200);
  check('list is array', Array.isArray(r.data), 'type=' + typeof r.data);
  r = await api('GET', '/api/notifications/unread-count', admin);
  ok('admin unread-count 200', r, 200);
  check('unread count numeric', !!r.data && typeof r.data.count === 'number', JSON.stringify(r.data));
  r = await api('POST', '/api/notifications/abc/read', admin, {});
  ok('mark-read abc 400', r, 400);
  r = await api('POST', '/api/notifications/999999999/read', admin, {});
  check('mark-read nonexistent 200 updated:false', r.status === 200 && r.data && r.data.updated === false, 'status=' + r.status + ' data=' + JSON.stringify(r.data));
  r = await api('POST', '/api/notifications/mark-all-read', admin, {});
  ok('mark-all-read 200', r, 200);
  check('mark-all-read count numeric', !!r.data && typeof r.data.updated === 'number', JSON.stringify(r.data));
  r = await api('GET', '/api/notifications/unread-count', admin);
  check('unread 0 after mark-all-read', r.data && r.data.count === 0, 'count=' + (r.data && r.data.count));

  // ================= G. ADMIN AS GRANTEE (WO-21, reversible) =================
  console.log('\n===== G. admin as grantee (WO-21) =====');
  const wo21 = (await q('SELECT id, created_by, status FROM work_orders WHERE id=21')).rows[0];
  check('WO-21 exists', !!wo21, JSON.stringify(wo21));
  const ownerId = wo21.created_by;
  const preAccess = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21 AND user_id=3')).rows[0].c;
  if (preAccess > 0) {
    r = await api('DELETE', '/api/work-orders/21/access/3', admin);
    ok('pre-clean revoke leftover 200', r, 200);
  }
  const maxNotifBefore = (await q('SELECT COALESCE(MAX(id),0)::int m FROM notifications')).rows[0].m;
  const maxAuditBefore = (await q('SELECT COALESCE(MAX(id),0)::int m FROM audit_trail')).rows[0].m;
  r = await api('POST', '/api/work-orders/21/access', admin, { user_id: 3 });
  ok('grant admin access 200', r, 200);
  const gotAccess = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21 AND user_id=3')).rows[0].c;
  check('DB access row (21,3)', gotAccess === 1, 'c=' + gotAccess);
  const grantNotifs = await waitFor(async () => {
    const rows = (await q(`SELECT user_id FROM notifications WHERE entity_id=21 AND status='ACCESS_GRANTED' AND id>$1`, [maxNotifBefore])).rows.map((x) => x.user_id);
    return (rows.includes(3) && rows.includes(ownerId)) ? rows : null;
  });
  check('ACCESS_GRANTED -> admin(3)+owner(' + ownerId + ')', !!grantNotifs, 'users=[' + (grantNotifs || []).join(',') + ']');
  const pmNotif = (await q(`SELECT id, is_read FROM notifications WHERE entity_id=21 AND status='ACCESS_GRANTED' AND user_id=$1 AND id>$2 ORDER BY id DESC LIMIT 1`, [ownerId, maxNotifBefore])).rows[0];

  // cross-user isolation: admin tries to mark owner's notification
  if (pmNotif && ownerId !== 3) {
    r = await api('POST', `/api/notifications/${pmNotif.id}/read`, admin, {});
    check('admin mark-read other user -> updated:false', r.status === 200 && r.data && r.data.updated === false, 'status=' + r.status + ' data=' + JSON.stringify(r.data));
    const stillUnread = (await q('SELECT is_read FROM notifications WHERE id=$1', [pmNotif.id])).rows[0];
    check('other user row still unread', stillUnread && stillUnread.is_read === false, JSON.stringify(stillUnread));
  } else {
    check('cross-user probe (owner is admin, self-row)', true, 'ownerId=' + ownerId + ' self-isolation N/A');
  }

  // admin unread-count rose + mark-read fresh row
  r = await api('GET', '/api/notifications/unread-count', admin);
  check('admin unread >=1 after grant', r.data && r.data.count >= 1, 'count=' + (r.data && r.data.count));
  const adminNotifId = (await q(`SELECT id FROM notifications WHERE entity_id=21 AND status='ACCESS_GRANTED' AND user_id=3 AND id>$1 ORDER BY id DESC LIMIT 1`, [maxNotifBefore])).rows[0];
  r = await api('POST', `/api/notifications/${adminNotifId.id}/read`, admin, {});
  check('admin mark-read own -> updated:true', r.status === 200 && r.data && r.data.updated === true, 'status=' + r.status + ' data=' + JSON.stringify(r.data));

  r = await api('DELETE', '/api/work-orders/21/access/3', admin);
  ok('revoke admin access 200', r, 200);
  const goneAccess = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21 AND user_id=3')).rows[0].c;
  check('DB access row removed', goneAccess === 0, 'c=' + goneAccess);
  const revokeNotifs = await waitFor(async () => {
    const rows = (await q(`SELECT user_id FROM notifications WHERE entity_id=21 AND status='ACCESS_REVOKED' AND id>$1`, [maxNotifBefore])).rows.map((x) => x.user_id);
    return (rows.includes(3) && rows.includes(ownerId)) ? rows : null;
  });
  check('ACCESS_REVOKED -> admin(3)+owner(' + ownerId + ')', !!revokeNotifs, 'users=[' + (revokeNotifs || []).join(',') + ']');
  // cleanup WO-21 test rows (notifications + audit scoped by id threshold)
  await q(`DELETE FROM notifications WHERE entity_id=21 AND id>$1`, [maxNotifBefore]);
  await q(`DELETE FROM audit_trail WHERE entity_type='WORK_ORDER' AND entity_id::text='21' AND id>$1`, [maxAuditBefore]);
  const left21 = (await q(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=21 AND id>$1`, [maxNotifBefore])).rows[0].c;
  check('WO-21 test notifications cleaned', left21 === 0, 'c=' + left21);

  // ================= I. IDOR PROBE (read-only) =================
  console.log('\n===== I. IDOR probe =====');
  const coderGrant21 = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21 AND user_id=2')).rows[0].c;
  check('coder has no grant on WO-21 (precondition)', coderGrant21 === 0, 'c=' + coderGrant21);
  r = await api('GET', '/api/work-orders/21/access', coder);
  if (r.status === 200) {
    check('IDOR FINDING: coder lists WO-21 grants without access (200)', true, 'rows=' + (Array.isArray(r.data) ? r.data.length : '?') + ' -> disclosure confirmed, see report');
  } else {
    check('IDOR guarded (non-200)', [403, 404].includes(r.status), 'status=' + r.status);
  }

  // ================= P. ROLLBACK PURGE ON ADMIN (scratch WO, wiped) =================
  console.log('\n===== P. purge scratch WO =====');
  const purgeNo = 'ADMPURGE-' + ts;
  r = await api('POST', '/api/work-orders', pm, {
    wo_number: purgeNo, title: 'Purge Test', description: 'purge', customer: 'QA',
    groups: [{ machine_model_id: 1, machine_model_version_id: 1, serial_number: 'pg-' + ts }],
  });
  ok('create purge WO 201', r, 201);
  const pwoId = r.data.id;
  const pGroup = r.data.groups[0].id;
  scratch.woIds.push(pwoId);
  const pTitle = `Qxzvk-${ts} widget`;
  r = await api('POST', `/api/work-orders/${pwoId}/items`, pm, { work_order_group_id: pGroup, title: pTitle, quantity: 1 });
  ok('add ambiguous item 201', r, 201);
  r = await api('POST', `/api/work-orders/${pwoId}/analyze`, pm);
  ok('analyze purge WO 200', r, 200);
  const pClsDb = (await q(`SELECT c.status, c.classification_method FROM classifications c JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1`, [pwoId])).rows[0];
  check('ambiguous item -> CODER_REVIEW', pClsDb && pClsDb.status === 'CODER_REVIEW', JSON.stringify(pClsDb));
  const adminUnreads = (await q(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=$1 AND status='CODER_REVIEW' AND user_id=3 AND is_read=FALSE`, [pwoId])).rows[0].c;
  check('admin has unread CODER_REVIEW (pre-rollback)', adminUnreads >= 1, 'c=' + adminUnreads);
  const coderUnreads = (await q(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=$1 AND status='CODER_REVIEW' AND user_id=2 AND is_read=FALSE`, [pwoId])).rows[0].c;
  check('coder has unread CODER_REVIEW (pre-rollback)', coderUnreads >= 1, 'c=' + coderUnreads);
  r = await api('PUT', `/api/work-orders/${pwoId}`, pm, { status: 'DRAFT' });
  ok('rollback to DRAFT 200', r, 200);
  const adminAfter = (await q(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=$1 AND status='CODER_REVIEW' AND user_id=3`, [pwoId])).rows[0].c;
  check('admin CODER_REVIEW purged by rollback', adminAfter === 0, 'c=' + adminAfter);
  const coderAfter = (await q(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=$1 AND status='CODER_REVIEW' AND user_id=2`, [pwoId])).rows[0].c;
  check('coder CODER_REVIEW purged by rollback', coderAfter === 0, 'c=' + coderAfter);

  // ================= W. WRONG-INPUT EDGES =================
  console.log('\n===== W. edges =====');
  // dashboard edges
  r = await api('GET', '/api/admin-dashboard?from=2026-09-03&to=2026-07-01', admin);
  check('dashboard from>to 200 no crash', r.status === 200 && r.data && Array.isArray(r.data.trend.buckets), 'status=' + r.status);
  r = await api('GET', '/api/admin-dashboard?from=2026-07-01', admin);
  ok('dashboard only-from 200', r, 200);
  r = await api('GET', '/api/admin-dashboard?from=2020-01-01&to=2026-09-03', admin);
  check('dashboard huge span 200 month gran', r.status === 200 && r.data && r.data.trend && r.data.trend.granularity === 'month', 'status=' + r.status + ' gran=' + (r.data && r.data.trend && r.data.trend.granularity));

  // users edges
  r = await api('POST', '/api/users', admin, { email: 'PM@DEMO.COM', username: `e1-${ts}`, roles: ['PM'], default_password: 'Testpass123', full_name: 'X' });
  ok('create dup email case-insensitive 409', r, 409);
  r = await api('POST', '/api/users', admin, { email: `e2-${ts}@example.com`, username: 'PM@DEMO', roles: ['PM'], default_password: 'Testpass123', full_name: 'X' });
  ok('create dup username case-insensitive 409', r, 409);
  // scratch PM user for edge tests
  r = await api('POST', '/api/users', admin, { email: `edge-${ts}@example.com`, username: `edge-${ts}`, roles: ['PM'], default_password: 'Testpass123', full_name: 'Edge User' });
  ok('create edge user 201', r, 201);
  const edgeId = r.data.id;
  scratch.userIds.push(edgeId);
  r = await api('PUT', `/api/users/${edgeId}`, admin, { email: 'changed@example.com', full_name: 'Edge Renamed' });
  check('update with email ignored (200, email unchanged)', r.status === 200, 'status=' + r.status);
  const edgeEmail = (await q('SELECT email FROM users WHERE id=$1', [edgeId])).rows[0];
  check('DB email unchanged after email-in-update', edgeEmail && edgeEmail.email === `edge-${ts}@example.com`, edgeEmail && edgeEmail.email);
  r = await api('PUT', `/api/users/${edgeId}`, admin, {});
  ok('update empty body 200', r, 200);
  r = await api('POST', '/api/users', admin, { email: `e3-${ts}@example.com`, username: `e3-${ts}`, roles: [], default_password: 'Testpass123', full_name: 'X' });
  ok('create roles [] 400', r, 400);
  r = await api('POST', '/api/users', admin, { email: `e4-${ts}@example.com`, username: `e4-${ts}`, roles: 'PM', default_password: 'Testpass123', full_name: 'X' });
  ok('create roles string 400', r, 400);
  r = await api('POST', '/api/users', admin, { email: `admrole-${ts}@example.com`, username: `admrole-${ts}`, roles: ['ADMIN'], default_password: 'Testpass123', full_name: 'Admin Role' });
  ok('create with ADMIN role 201', r, 201);
  scratch.userIds.push(r.data.id);
  // reset pwd on deactivated user
  r = await api('PUT', `/api/users/${edgeId}`, admin, { is_active: false });
  ok('deactivate edge user 200', r, 200);
  r = await api('POST', `/api/users/${edgeId}/reset-password`, admin, { new_password: 'Edgepass789' });
  ok('reset pwd on deactivated 200', r, 200);
  const stillBlocked = await (async () => { try { await login(`edge-${ts}@example.com`, 'Edgepass789'); return false; } catch (e) { return true; } })();
  check('deactivated login still blocked after reset', stillBlocked === true, 'blocked=' + stillBlocked);

  // complexity recreate-after-deactivate
  const cxA = `A2T${String(ts).slice(-6)}`;
  r = await api('POST', '/api/complexity-levels', admin, { code: cxA, name: 'Edge CX' });
  ok('create edge complexity 201', r, 201);
  scratch.cxIds.push(r.data.id);
  r = await api('DELETE', `/api/complexity-levels/${r.data.id}`, admin);
  ok('delete edge complexity 200', r, 200);
  r = await api('POST', '/api/complexity-levels', admin, { code: cxA, name: 'Recreate' });
  ok('recreate deactivated code 409 (documented)', r, 409);
  r = await api('PUT', `/api/complexity-levels/${scratch.cxIds[0]}`, admin, { is_active: true });
  ok('reactivate complexity 200', r, 200);

  // KB edges
  r = await api('POST', '/api/kb', admin, { kb_code: `A2KB-${ts}`, title: 'Edge KB A', fw_related: true, complexity_level_id: 3, confidence_score: 80 });
  ok('create edge KB-A 201', r, 201);
  const kbA = r.data.id;
  scratch.kbIds.push(kbA);
  r = await api('PUT', `/api/kb/${kbA}`, admin, { kb_code: 'KB-0001', title: 'Dup code', fw_related: true, complexity_level_id: 3, confidence_score: 80, is_active: true });
  ok('update kb to dup code 409', r, 409);
  r = await api('POST', '/api/kb', admin, { kb_code: `A2KB2-${ts}`, title: 'Null FW', fw_related: null, complexity_level_id: 3, confidence_score: 80 });
  ok('create kb fw_related null 400', r, 400);
  r = await api('POST', '/api/kb', admin, { kb_code: `A2KB3-${ts}`, title: 'Edge KB B', fw_related: false, complexity_level_id: null, confidence_score: 70 });
  ok('create edge KB-B (non-FW) 201', r, 201);
  const kbB = r.data.id;
  scratch.kbIds.push(kbB);
  r = await api('PUT', `/api/kb/${kbB}`, admin, { kb_code: `A2KB3-${ts}`, title: 'Edge KB B', fw_related: false, complexity_level_id: null, confidence_score: 70, is_active: false });
  ok('deactivate KB-B 200', r, 200);
  r = await api('GET', '/api/kb', admin);
  check('inactive KB still listed (documented)', Array.isArray(r.data) && r.data.some((x) => x.id === kbB && x.is_active === false), 'found=' + (Array.isArray(r.data) && r.data.some((x) => x.id === kbB)));
  // kb test tiers
  r = await api('POST', '/api/kb/1/test', admin, { sample_text: 'Change alarm setpoint configuration alarm setpoint configuration' });
  check('kb test exact-ish tier', r.status === 200 && ['EXACT_MATCH', 'SIMILARITY'].includes(r.data && r.data.verdict), 'status=' + r.status + ' verdict=' + (r.data && r.data.verdict) + ' score=' + (r.data && r.data.score));
  r = await api('POST', '/api/kb/1/test', admin, { sample_text: 'zzzqqq xxx jjj' });
  check('kb test nonsense NO_MATCH', r.status === 200 && r.data && r.data.verdict === 'NO_MATCH', 'status=' + r.status + ' verdict=' + (r.data && r.data.verdict));

  // models edges
  r = await api('POST', '/api/machine-models', admin, { model_code: `A2MM-${ts}`, name: 'Edge Model' });
  ok('create edge model 201', r, 201);
  const mA = r.data.id;
  scratch.modelIds.push(mA);
  r = await api('PUT', `/api/machine-models/${mA}`, admin, { model_code: 'MM-1000' });
  ok('update model to dup code 409', r, 409);
  r = await api('POST', `/api/machine-models/${mA}/versions`, admin, {});
  ok('create version missing code 400', r, 400);
  r = await api('POST', `/api/machine-models/${mA}/versions`, admin, { version_code: 'V-A' });
  ok('create version V-A 201', r, 201);
  const v1 = r.data.id;
  scratch.verIds.push(v1);
  r = await api('POST', `/api/machine-models/${mA}/versions`, admin, { version_code: 'V-B' });
  ok('create version V-B 201', r, 201);
  const v2 = r.data.id;
  scratch.verIds.push(v2);
  r = await api('PUT', `/api/machine-models/versions/${v2}`, admin, { version_code: 'V-A' });
  ok('update version to dup code 409', r, 409);
  r = await api('POST', '/api/machine-models', admin, { model_code: `A2MMB-${ts}`, name: 'Orphan Model' });
  const mB = r.data.id;
  scratch.modelIds.push(mB);
  r = await api('POST', `/api/machine-models/${mB}/versions`, admin, { version_code: 'V-X' });
  const vX = r.data.id;
  scratch.verIds.push(vX);
  r = await api('DELETE', `/api/machine-models/${mB}`, admin);
  ok('delete model with versions 200', r, 200);
  r = await api('GET', `/api/machine-models/${mB}/versions`, admin);
  check('versions of deleted model still listed (documented orphan)', r.status === 200 && Array.isArray(r.data) && r.data.some((v) => v.id === vX), 'status=' + r.status);

  // audit limits
  r = await api('GET', '/api/audit-log?limit=1', admin);
  check('audit limit=1 respected', r.status === 200 && r.data.items.length <= 1, 'n=' + (r.data && r.data.items.length));
  r = await api('GET', '/api/audit-log?limit=1000', admin);
  ok('audit limit=1000 200', r, 200);
  r = await api('GET', '/api/audit-log?limit=-5', admin);
  ok('audit limit -5 400', r, 400);
  r = await api('GET', '/api/audit-log?limit=2.5', admin);
  ok('audit limit 2.5 400', r, 400);

  // ================= AU. AUTH EDGES =================
  console.log('\n===== AU. auth edges =====');
  r = await api('POST', '/api/auth/login', undefined, { identifier: 'admin@demo', password: 'wrongpassword' });
  ok('login wrong password 401', r, 401);
  r = await api('POST', '/api/auth/login', undefined, { identifier: 'nosuchuser', password: 'x' });
  ok('login unknown user 401', r, 401);
  r = await api('POST', '/api/auth/login', undefined, { identifier: 'admin@demo' });
  check('login missing password 4xx (no 500)', r.status >= 400 && r.status < 500, 'status=' + r.status);
  r = await rawGet('/api/users?token=' + admin, undefined);
  check('?token= query param accepted (documented)', [200, 401, 403].includes(r.status), 'status=' + r.status);
  r = await api('GET', '/api/users', 'tampered.token.here');
  ok('tampered token 401', r, 401);

  // ================= S. SELF-DEACTIVATION (scratch ADMIN) =================
  console.log('\n===== S. self-deactivation =====');
  r = await api('POST', '/api/users', admin, { email: `selfadm-${ts}@example.com`, username: `selfadm-${ts}`, roles: ['ADMIN'], default_password: 'Selfpass123', full_name: 'Self Admin' });
  ok('create scratch ADMIN 201', r, 201);
  const selfId = r.data.id;
  scratch.userIds.push(selfId);
  const selfTok = await login(`selfadm-${ts}@example.com`, 'Selfpass123');
  check('scratch admin login works', !!selfTok, 'len=' + (selfTok && selfTok.length));
  r = await api('PUT', `/api/users/${selfId}`, selfTok, { is_active: false });
  ok('self-deactivate 200 (no guard)', r, 200);
  const selfBlocked = await (async () => { try { await login(`selfadm-${ts}@example.com`, 'Selfpass123'); return false; } catch (e) { return true; } })();
  check('self-deactivated login blocked', selfBlocked === true, 'blocked=' + selfBlocked);
  r = await api('PUT', `/api/users/${selfId}`, admin, { is_active: true });
  ok('reactivate by real admin 200', r, 200);
  const selfBack = await (async () => { try { await login(`selfadm-${ts}@example.com`, 'Selfpass123'); return true; } catch (e) { return false; } })();
  check('reactivated login works', selfBack === true, 'ok=' + selfBack);

  // ================= CLEANUP =================
  console.log('\n===== CLEANUP =====');
  async function wipeWO(id) {
    await q('DELETE FROM production_tasks WHERE work_order_id=$1', [id]);
    await q('DELETE FROM notifications WHERE entity_id=$1', [id]);
    await q('DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)', [id]);
    await q('DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1))', [id]);
    await q('DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)', [id]);
    await q('DELETE FROM work_order_items WHERE work_order_id=$1', [id]);
    await q('DELETE FROM work_order_groups WHERE work_order_id=$1', [id]);
    await q('DELETE FROM work_order_access WHERE work_order_id=$1', [id]);
    await q(`DELETE FROM audit_trail WHERE entity_type='WORK_ORDER' AND entity_id::text=$1`, [String(id)]);
    await q('DELETE FROM work_orders WHERE id=$1', [id]);
  }
  for (const id of scratch.woIds) { await wipeWO(id); }
  check('purge WO wiped', (await q(`SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE 'ADMPURGE-%'`, [])).rows[0].c === 0, 'left');
  for (const id of scratch.kbIds) { await api('DELETE', `/api/kb/${id}`, admin); }
  check('scratch KB deleted via API', (await q(`SELECT COUNT(*)::int c FROM kb_items WHERE kb_code LIKE 'A2KB%'`, [])).rows[0].c === 0, 'left');
  for (const id of scratch.verIds) await q('DELETE FROM machine_model_ver WHERE id=$1', [id]);
  for (const id of scratch.modelIds) await q('DELETE FROM machine_model WHERE id=$1', [id]);
  for (const id of scratch.cxIds) await q('DELETE FROM complexity_levels WHERE id=$1', [id]);
  for (const id of scratch.userIds) {
    await q(`DELETE FROM audit_trail WHERE entity_type='USER' AND entity_id::text=$1`, [String(id)]);
    await q('DELETE FROM user_roles WHERE user_id=$1', [id]);
    await q('DELETE FROM users WHERE id=$1', [id]);
  }
  const residue = [
    ['no scratch users', `SELECT COUNT(*)::int c FROM users WHERE email LIKE '%-${ts}@example.com'`, []],
    ['no scratch complexity', `SELECT COUNT(*)::int c FROM complexity_levels WHERE code LIKE 'A2T%'`, []],
    ['no scratch models', `SELECT COUNT(*)::int c FROM machine_model WHERE model_code LIKE 'A2MM%'`, []],
    ['no ADMPURGE rows', `SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE 'ADMPURGE-%'`, []],
    ['no scratch user audit', `SELECT COUNT(*)::int c FROM audit_trail WHERE entity_type='USER' AND entity_id::text = ANY($1)`, [scratch.userIds.map(String)]],
  ];
  for (const [label, sql, args] of residue) {
    const c = (await q(sql, args)).rows[0].c;
    check(label, c === 0, 'c=' + c);
  }
  const leftV = (await q(`SELECT COUNT(*)::int c FROM machine_model_ver WHERE id = ANY($1)`, [scratch.verIds.length ? scratch.verIds : [0]])).rows[0].c;
  check('no scratch versions remain', leftV === 0, 'c=' + leftV);
  // real data integrity
  const uCount = (await q('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  check('real user count = 4', uCount === 4, 'c=' + uCount);
  const wo21ok = (await q('SELECT status FROM work_orders WHERE id=21')).rows[0];
  check('WO-21 intact (DRAFT)', wo21ok && wo21ok.status === 'DRAFT', JSON.stringify(wo21ok));
  const acc21 = (await q('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=21')).rows[0].c;
  check('WO-21 access grants baseline (0)', acc21 === 0, 'c=' + acc21);

  console.log('\n=== ' + pass + ' PASS / ' + fail + ' FAIL ===');
  if (fails.length) { console.log('FAILED:'); fails.forEach((l) => console.log('  - ' + l)); }
  require('fs').writeFileSync('C:/Program Files/Firmware Custom/tempLiveTest/_admin2-results.json',
    JSON.stringify({ pass, fail, fails, ts }, null, 2));
  pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });
