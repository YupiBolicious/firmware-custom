// Auditability + observability smoke (2026-09-18). Self-cleaning; backend :5000.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
const { execFileSync } = require('child_process');
const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com', admin: 'admin@demo.com' };
const PW = 'password123';
const PREFIX = 'AUD-';
const BACKEND = 'C:/Program Files/Firmware Custom/backend';

async function api(method, path, token, body, form) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + path, { method, headers, body: payload });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
async function query(sql, params) { return pool.query(sql, params); }
async function login(key) {
  const r = await api('POST', '/api/auth/login', undefined, { identifier: EMAILS[key], password: PW });
  if (!r.data || !r.data.token) throw new Error('login failed ' + key + ' ' + r.status);
  return r.data;
}

let pass = 0, fail = 0;
const failLines = [], notes = [], gaps = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; failLines.push(name); console.log('FAIL ' + name + ' -> ' + detail); }
}
function note(name, detail) { notes.push(name); console.log('NOTE ' + name + ' -> ' + detail); }
const fr = (rows, action) => rows.find((x) => x.action === action);

async function sweepScratch() {
  const leftovers = (await query("SELECT id FROM work_orders WHERE wo_number LIKE '" + PREFIX + "-%'")).rows.map((x) => x.id);
  if (!leftovers.length) return;
  const itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [leftovers])).rows.map((x) => x.id);
  const taskIds = (await query('SELECT id FROM production_tasks WHERE work_order_id = ANY($1)', [leftovers])).rows.map((x) => x.id);
  await query(`DELETE FROM audit_trail WHERE work_order_id = ANY($1)
     OR (entity_type='WORK_ORDER' AND entity_id = ANY($1))
     OR (entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($2))
     OR (entity_type='PRODUCTION_TASK' AND entity_id = ANY($3))`, [leftovers, itemIds, taskIds]);
  await query('DELETE FROM notifications WHERE entity_id = ANY($1)', [leftovers]);
  await query('DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))', [leftovers]);
  await query('DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))', [leftovers]);
  await query('DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))', [leftovers]);
  await query('DELETE FROM production_tasks WHERE work_order_id = ANY($1)', [leftovers]);
  await query('DELETE FROM work_order_documents WHERE work_order_id = ANY($1)', [leftovers]);
  await query('DELETE FROM work_order_access WHERE work_order_id = ANY($1)', [leftovers]);
  await query('DELETE FROM work_order_items WHERE work_order_id = ANY($1)', [leftovers]);
  if (itemIds.length) await query('DELETE FROM kb_items WHERE kb_code = ANY($1)', [itemIds.map((i) => 'KB-CODER-' + i)]);
  await query('DELETE FROM work_order_groups WHERE work_order_id = ANY($1)', [leftovers]);
  await query('DELETE FROM work_orders WHERE id = ANY($1)', [leftovers]);
}

(async () => {
  const ts = Date.now();
  await sweepScratch();
  const [pmAcc, coderAcc, adminAcc] = await Promise.all([login('pm'), login('coder'), login('admin')]);
  const pmId = pmAcc.user.id, coderId = coderAcc.user.id;
  const pm = pmAcc.token, coder = coderAcc.token, admin = adminAcc.token;

  const model = (await query(
    `SELECT mm.id AS model_id, mmv.id AS version_id
     FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
     ORDER BY mm.id, mmv.id LIMIT 1`
  )).rows[0];
  const group = { machine_model_id: model.model_id, machine_model_version_id: model.version_id, serial_number: 'aud-' + ts };
  const woNumber = PREFIX + 'WO-' + ts;

  let r = await api('POST', '/api/work-orders', pm, { wo_number: woNumber, title: 'AUD smoke', description: 'aud', customer: 'QA', groups: [group] });
  const woId = r.data.id;
  const groupId = r.data.groups[0].id;
  check('create WO 201', r.status === 201, 'status=' + r.status);

  r = await api('POST', '/api/work-orders/' + woId + '/access', pm, { user_id: coderId });
  check('grant access 200', r.status === 200, 'status=' + r.status);

  const itemTitles = ['Menu tree modification', 'Update UI text', 'QUXZZQ' + ts + ' zzq'];
  const itemIds = [];
  for (const t of itemTitles) {
    const ir = await api('POST', '/api/work-orders/' + woId + '/items', pm, { work_order_group_id: groupId, title: t, quantity: 1 });
    if (ir.status === 201) itemIds.push(ir.data.id);
  }
  check('3 items added', itemIds.length === 3, 'n=' + itemIds.length);

  const an = await api('POST', '/api/work-orders/' + woId + '/analyze', pm);
  check('analyze 200 with perf', an.status === 200 && an.data && an.data.perf, 'status=' + an.status);
  note('analyze perf', JSON.stringify(an.data && an.data.perf));

  const pending = (await query(
    `SELECT c.work_order_item_id AS id FROM classifications c
     JOIN work_order_items woi ON woi.id=c.work_order_item_id
     WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW' ORDER BY 1`, [woId]
  )).rows;
  note('items pending review', pending.length + ' (corpus-driven)');
  for (const p of pending) {
    await api('POST', '/api/work-orders/items/' + p.id + '/review', coder, { complexity_level_id: 3, notes: 'fill' });
  }

  const fin = await api('POST', '/api/work-orders/' + woId + '/finalize', pm);
  check('finalize 200', fin.status === 200, 'status=' + fin.status);
  r = await api('POST', '/api/work-orders/' + woId + '/production', coder);
  check('start production 200', r.status === 200, 'status=' + r.status);

  const tasks = (await query('SELECT id FROM production_tasks WHERE work_order_id=$1 ORDER BY id LIMIT 1', [woId])).rows;
  const taskId = tasks.length ? tasks[0].id : null;
  check('production tasks exist', taskId != null, 'n=' + tasks.length);
  if (taskId != null) {
    r = await api('PUT', '/api/work-orders/' + woId + '/production/tasks/' + taskId, coder, { completed: true });
    check('complete task 200', r.status === 200, 'status=' + r.status);
  }

  const upForm = new FormData();
  upForm.append('files', new Blob(['AUD ' + ts], { type: 'text/plain' }), 'aud-' + ts + '.txt');
  r = await api('POST', '/api/work-orders/' + woId + '/documents', coder, upForm, upForm);
  check('doc upload 201 (auto-complete)', r.status === 201, 'status=' + r.status);

  const aud = (await query(`SELECT * FROM audit_trail
    WHERE work_order_id=$1 OR (entity_type='WORK_ORDER' AND entity_id=$1) ORDER BY id`, [woId])).rows;
  note('audit rows for scratch WO', aud.length + '');

  const createRow = fr(aud, 'WORK_ORDER_CREATED');
  check('audit WORK_ORDER_CREATED', !!createRow, '');
  check('create details wo_number+group_count', createRow && createRow.details.wo_number === woNumber && createRow.details.group_count >= 1, JSON.stringify(createRow && createRow.details));
  check('create actor=pm ip captured', createRow && Number(createRow.user_id) === pmId
    && (String(createRow.ip_address).indexOf('::1') >= 0 || String(createRow.ip_address).indexOf('127.0.0.1') >= 0),
    'user=' + (createRow && createRow.user_id) + ' ip=' + (createRow && createRow.ip_address));

  const grantRow = fr(aud, 'WORK_ORDER_ACCESS_GRANTED');
  check('audit ACCESS_GRANTED', !!grantRow, '');
  check('grant details target=coder', grantRow && Number(grantRow.details.granted_user_id) === coderId, JSON.stringify(grantRow && grantRow.details));

  const decided = (await query(
    `SELECT action,entity_id,details,work_order_id FROM audit_trail
     WHERE entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($1) AND action='CLASSIFY_DECIDED'`, [itemIds])).rows;
  check('audit CLASSIFY_DECIDED per item (3)', decided.length === itemIds.length, 'n=' + decided.length + ' exp ' + itemIds.length);
  check('decided telemetry rich', decided.length > 0 && decided.every((d) => d.details && d.details.classification_id != null && d.details.path), 'rich');
  check('decided work_order_id linked', decided.length > 0 && decided.every((d) => Number(d.work_order_id) === woId), 'wos=' + decided.map((d) => d.work_order_id).join(','));
  const blocked = decided.filter((d) => d.details && d.details.block_reason != null);
  note('decided block reasons', blocked.length + ' blocked ' + (blocked[0] ? blocked[0].details.block_reason : 'none'));

  const analyzed = fr(aud, 'WORK_ORDER_ANALYZED');
  check('audit WORK_ORDER_ANALYZED', !!analyzed, '');
  check('analyzed item_count=3 actor=pm', analyzed && Number(analyzed.details.item_count) === itemTitles.length && Number(analyzed.user_id) === pmId, JSON.stringify(analyzed && analyzed.details));

  const reviewed = (await query(
    `SELECT action,entity_id,details,user_id FROM audit_trail
     WHERE entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($1) AND action IN ('ITEM_REVIEWED','CLASSIFY_REVIEWED') ORDER BY id`, [itemIds])).rows;
  check('audit ITEM_REVIEWED + CLASSIFY_REVIEWED', reviewed.filter((x) => x.action === 'ITEM_REVIEWED').length === pending.length && reviewed.filter((x) => x.action === 'CLASSIFY_REVIEWED').length === pending.length, 'reviewed=' + pending.length + ' rows=' + reviewed.length);
  const revRow = fr(reviewed, 'CLASSIFY_REVIEWED');
  check('reviewed telem final complexity+code', revRow && revRow.details && revRow.details.final_complexity_id != null && !!revRow.details.final_level_code, JSON.stringify(revRow && revRow.details));
  const irRow = fr(reviewed, 'ITEM_REVIEWED');
  check('review actor=coder', irRow && Number(irRow.user_id) === coderId, 'user=' + (irRow && irRow.user_id));

  const finalized = fr(aud, 'WORK_ORDER_FINALIZED');
  check('audit WORK_ORDER_FINALIZED', !!finalized, '');
  check('finalized item_count + task_count', finalized && Number(finalized.details.item_count) === itemTitles.length && Number(finalized.details.production_task_count) >= 1, JSON.stringify(finalized && finalized.details));
  check('finalized work_order_id linked', finalized && Number(finalized.work_order_id) === woId, 'wo=' + (finalized && finalized.work_order_id));

  const production = fr(aud, 'WORK_ORDER_PRODUCTION');
  check('audit WORK_ORDER_PRODUCTION', !!production, '');
  check('production user_id captured', production && Number(production.user_id) === coderId, 'user=' + (production && production.user_id));
  check('production work_order_id linked', production && Number(production.work_order_id) === woId, 'wo=' + (production && production.work_order_id));

  const taskRow = fr(aud, 'PRODUCTION_TASK_COMPLETED');
  check('audit TASK_COMPLETED', !!taskRow, '');
  check('task entity+code+link+actor', taskRow && taskId != null && Number(taskRow.entity_id) === taskId && !!taskRow.details.task_code && Number(taskRow.work_order_id) === woId && Number(taskRow.user_id) === coderId, JSON.stringify(taskRow && taskRow.details));

  const docsRow = fr(aud, 'DOCUMENTS_UPLOADED');
  check('audit DOCUMENTS_UPLOADED', !!docsRow, '');
  check('docs count=1 actor=coder', docsRow && Number(docsRow.details.count) === 1 && Number(docsRow.user_id) === coderId, JSON.stringify(docsRow && docsRow.details));

  const completed = fr(aud, 'WORK_ORDER_COMPLETED');
  check('audit WORK_ORDER_COMPLETED (doc trigger)', !!completed, '');
  check('completed trigger+actor', completed && completed.details.trigger === 'document_upload' && Number(completed.user_id) === coderId, JSON.stringify(completed && completed.details));
  notes.push('CLASSIFY_DECIDED / WORK_ORDER_FINALIZED / WORK_ORDER_PRODUCTION now carry work_order_id (fix applied ' + new Date().toISOString().slice(0, 10) + ') — WO filter in audit-log now includes them');
  notes.push('login audit active (' + new Date().toISOString().slice(0, 10) + '): USER_LOGIN (success) + LOGIN_FAILED (401/403, identifier+reason+ip, user_id when resolved); validation 400 not audited per spec');

  const ref = await api('GET', '/api/audit-log?work_order_id=' + woId, pm);
  const sqlCount = (await query('SELECT COUNT(*)::int c FROM audit_trail WHERE work_order_id=$1', [woId])).rows[0].c;
  check('audit-log envelope total=SQL', ref.status === 200 && ref.data && ref.data.total === sqlCount, 'status=' + ref.status + ' api=' + (ref.data && ref.data.total) + ' sql=' + sqlCount);
  check('audit-log rows joined identity', !!(ref.data && ref.data.items) && ref.data.items.every((row) => row.user_name || row.wo_number || row.item_number), JSON.stringify(((ref.data && ref.data.items) || [])[0] || null));

  const rc = [pm, coder, admin];
  const rolesOk = [];
  for (const tok of rc) rolesOk.push((await api('GET', '/api/audit-log?limit=1', tok)).status);
  check('audit-log readable by all roles', rolesOk.every((s) => s === 200), rolesOk.join(','));
  const anon = await api('GET', '/api/audit-log?limit=1');
  check('audit-log unauthenticated 401', anon.status === 401, 'status=' + anon.status);
  const badDate = await api('GET', '/api/audit-log?date_from=2026-99-99', pm);
  check('audit-log bad date 400', badDate.status === 400 && badDate.json && badDate.json.success === false, 'status=' + badDate.status);
  const badUser = await api('GET', '/api/audit-log?user_id=abc', pm);
  check('audit-log bad user_id 400', badUser.status === 400 && badUser.json && badUser.json.success === false, 'status=' + badUser.status);

  r = await api('GET', '/api/audit-log?action=WORK_ORDER_ANALYZED&work_order_id=' + woId, pm);
  check('action filter exact', r.status === 200 && !!(r.data && r.data.items) && r.data.items.every((row) => row.action === 'WORK_ORDER_ANALYZED'), 'n=' + (r.data && r.data.items && r.data.items.length));
  r = await api('GET', '/api/audit-log?search=' + encodeURIComponent(woNumber) + '&limit=10', pm);
  const searchHit = r.data && r.data.items && r.data.items.find((row) => row.details && row.details.wo_number === woNumber);
  check('search by wo_number finds create row', r.status === 200 && !!searchHit, 'hits=' + (r.data && r.data.items && r.data.items.length));
  const p1 = await api('GET', '/api/audit-log?work_order_id=' + woId + '&limit=2&page=1', pm);
  const p2 = await api('GET', '/api/audit-log?work_order_id=' + woId + '&limit=2&page=2', pm);
  check('paging stable total + bounded rows', p1.data && p2.data && p2.data.total === p1.data.total && p2.data.items && p2.data.items.length <= 2, 'p1=' + (p1.data && p1.data.total) + ' p2rows=' + (p2.data && p2.data.items && p2.data.items.length));

  r = await api('GET', '/api/health');
  check('health 200 + ISO time', r.status === 200 && r.data && r.data.time && !isNaN(Date.parse(r.data.time)), 'status=' + r.status);
  notes.push('/api/health static (time only): no DB/embedder ping');

  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  r = await api('GET', '/api/admin-dashboard?from=' + from + '&to=' + to, admin);
  const dh = r.data && r.data.health;
  check('admin dashboard health block', r.status === 200 && dh, 'status=' + r.status);
  check('dashboard api/database literals online', dh && dh.api === 'online' && dh.database === 'online', JSON.stringify(dh));
  notes.push('dashboard health.api/database hard-coded online (adminDashboardService.js:38-39)');

  try {
    const out = execFileSync('node', ['scripts/score-semantic-telemetry.js'], { cwd: BACKEND, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const lines = out.trim().split(/\r?\n/).filter(Boolean);
    check('telemetry score script runs', lines.length >= 2 && lines[0].indexOf('decided events:') === 0, lines.join(' | '));
    note('telemetry score', lines.join(' ; '));
  } catch (e) {
    check('telemetry score script runs', false, String((e && e.stdout) || (e && e.message)));
  }

  const runStartIso = new Date(ts).toISOString();
  let scratchId = null;
  const sRow = (await query("SELECT * FROM audit_trail WHERE action='USER_LOGIN' AND user_id=$1 AND created_at >= $2", [pmId, runStartIso])).rows[0];
  check('audit USER_LOGIN success (pm)', !!sRow, '');
  check('login user_id + ip', sRow && Number(sRow.user_id) === pmId && (String(sRow.ip_address).indexOf('::1') >= 0 || String(sRow.ip_address).indexOf('127.0.0.1') >= 0), 'user=' + (sRow && sRow.user_id) + ' ip=' + (sRow && sRow.ip_address));

  const lfCount = async () => (await query("SELECT COUNT(*)::int c FROM audit_trail WHERE action='LOGIN_FAILED' AND created_at >= $1", [runStartIso])).rows[0].c;
  const lfBefore = await lfCount();
  let lr = await api('POST', '/api/auth/login', undefined, { identifier: 'someone@example.com' });
  check('login validation 400', lr.status === 400, 'status=' + lr.status);
  check('validation 400 not audited', (await lfCount()) === lfBefore, 'before=' + lfBefore + ' after=' + (await lfCount()));

  const badId = 'audlf-' + ts + '@nowhere.invalid';
  lr = await api('POST', '/api/auth/login', undefined, { identifier: badId, password: 'whatever' });
  check('login unknown identifier 401', lr.status === 401, 'status=' + lr.status);
  let f = (await query("SELECT * FROM audit_trail WHERE action='LOGIN_FAILED' AND details->>'identifier'=$1 AND created_at >= $2", [badId, runStartIso])).rows[0];
  check('LOGIN_FAILED unknown user null user_id', f && f.user_id == null && f.details.reason === 'invalid_credentials', JSON.stringify(f && f.details));

  lr = await api('POST', '/api/auth/login', undefined, { identifier: EMAILS.pm, password: 'wrongpass' });
  check('login wrong password 401', lr.status === 401, 'status=' + lr.status);
  f = (await query("SELECT * FROM audit_trail WHERE action='LOGIN_FAILED' AND details->>'identifier'=$1 AND details->>'reason'='invalid_credentials' AND created_at >= $2", [EMAILS.pm, runStartIso])).rows[0];
  check('LOGIN_FAILED wrong pwd user_id resolved', f && Number(f.user_id) === pmId, 'user=' + (f && f.user_id));

  const uname = 'audlf' + ts;
  let rr = await api('POST', '/api/users', adminAcc.token, { username: uname, email: uname + '@nowhere.invalid', full_name: 'Login Audit Probe', default_password: 'password123', roles: ['CODER'] });
  check('scratch user created', rr.status === 201, 'status=' + rr.status);
  scratchId = rr.data && rr.data.id;
  rr = await api('PUT', '/api/users/' + scratchId, adminAcc.token, { is_active: false });
  check('scratch user deactivated', rr.status === 200, 'status=' + rr.status);
  lr = await api('POST', '/api/auth/login', undefined, { identifier: uname + '@nowhere.invalid', password: 'password123' });
  check('login deactivated 403', lr.status === 403, 'status=' + lr.status);
  f = (await query("SELECT * FROM audit_trail WHERE action='LOGIN_FAILED' AND details->>'reason'='deactivated' AND user_id=$1 AND created_at >= $2", [scratchId, runStartIso])).rows[0];
  check('LOGIN_FAILED deactivated user_id + reason', f && Number(f.user_id) === scratchId && f.details.reason === 'deactivated', 'user=' + (f && f.user_id) + ' reason=' + (f && f.details && f.details.reason));

  const ids = [woId];
  const itemIds2 = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [ids])).rows.map((x) => x.id);
  const taskIds = (await query('SELECT id FROM production_tasks WHERE work_order_id = ANY($1)', [ids])).rows.map((x) => x.id);
  await query(
    `DELETE FROM audit_trail WHERE work_order_id = ANY($1)
       OR (entity_type='WORK_ORDER' AND entity_id = ANY($1))
       OR (entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($2))
       OR (entity_type='PRODUCTION_TASK' AND entity_id = ANY($3))`, [ids, itemIds2, taskIds]);
  await query('DELETE FROM notifications WHERE entity_id = ANY($1)', [ids]);
  await query('DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))', [ids]);
  await query('DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))', [ids]);
  await query('DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))', [ids]);
  await query('DELETE FROM production_tasks WHERE work_order_id = ANY($1)', [ids]);
  await query('DELETE FROM work_order_documents WHERE work_order_id = ANY($1)', [ids]);
  await query('DELETE FROM work_order_access WHERE work_order_id = ANY($1)', [ids]);
  await query('DELETE FROM work_order_items WHERE work_order_id = ANY($1)', [ids]);
  if (itemIds2.length) await query('DELETE FROM kb_items WHERE kb_code = ANY($1)', [itemIds2.map((i) => 'KB-CODER-' + i)]);
  await query('DELETE FROM work_order_groups WHERE work_order_id = ANY($1)', [ids]);
  await query('DELETE FROM work_orders WHERE id = ANY($1)', [ids]);

  if (scratchId) {
    await query("DELETE FROM audit_trail WHERE user_id=$1 AND action IN ('LOGIN_FAILED','USER_LOGIN','USER_CREATED','USER_UPDATED')", [scratchId]);
    await query('DELETE FROM users WHERE id=$1', [scratchId]);
  }
  await query("DELETE FROM audit_trail WHERE created_at >= $1 AND action IN ('USER_LOGIN','LOGIN_FAILED')", [runStartIso]);

  const usersAfter = (await query('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  check('user count restored (5)', usersAfter === 5, 'c=' + usersAfter);
  const scratchUsersLeft = (await query("SELECT COUNT(*)::int c FROM users WHERE username LIKE 'audlf%' OR email LIKE 'audlf-%'")).rows[0].c;
  check('no scratch users left', scratchUsersLeft === 0, 'c=' + scratchUsersLeft);
  const audAfter = (await query('SELECT COUNT(*)::int c FROM audit_trail WHERE entity_type=$1 AND entity_id = ANY($2)', ['WORK_ORDER', ids])).rows[0].c;
  check('scratch WORK_ORDER audit rows wiped', audAfter === 0, 'c=' + audAfter);
  const scratchLeft = (await query("SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE '" + PREFIX + "-%'")).rows[0].c;
  check('no scratch WOs left', scratchLeft === 0, 'c=' + scratchLeft);

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL =====');
  if (failLines.length) { console.log('FAILED:'); failLines.forEach((l) => console.log('  - ' + l)); }
  console.log('GAPS (recorded, smoke stays green):');
  gaps.forEach((g) => console.log('  - ' + g));
  console.log('NOTES:');
  notes.forEach((n) => console.log('  - ' + n));

  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });