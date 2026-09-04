// Live End-to-End Full Flow Test
// Drives WO + WOI creation through COMPLETE on 2 scratch WOs.
// Notification expectations are recorded during the flow and verified at the
// end against the settled DB state (deterministic) + via the /api/notifications surface.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

const CREDS = { 1: 'password123', 2: 'password123', 3: 'password123', 16: 'pmmockdata' };
const EMAILS = { 1: 'pm@demo.com', 2: 'coder@demo.com', 3: 'admin@demo.com', 16: 'pm@test.com' };

async function api(method, path, token, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
async function query(sql, params) { return pool.query(sql, params); }
async function loginUserId(userId) {
  const r = await api('POST', '/api/auth/login', undefined, { identifier: EMAILS[userId], password: CREDS[userId] });
  if (!r.data || !r.data.token) throw new Error('login failed for user ' + userId);
  return r.data.token;
}

let pass = 0, fail = 0;
const failLines = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; failLines.push(name + (detail ? '  [' + detail + ']' : '')); console.log('FAIL ' + name + ' -> ' + detail); }
}
function okStatus(name, r, want) {
  check(name + ' ' + want, r.status === want, 'status=' + r.status + (r.json && r.json.message ? ' ' + r.json.message : ''));
}

// expectations: { woId, status, recipients: { STATUS: [userIds], } }
const expectations = [];
const results = {};

async function runWo({ tag, woNumber, items, granteeUserId }) {
  console.log('\n===== WO: ' + woNumber + ' (' + tag + ') =====');
  const pm = await loginUserId(1);
  const coder = await loginUserId(2);

  let r = await api('POST', '/api/work-orders', pm, {
    wo_number: woNumber, title: 'LIVETEST ' + tag, description: 'e2e ' + tag, customer: 'QA',
    groups: [{ machine_model_id: 1, machine_model_version_id: 1, serial_number: 'lt-' + tag }],
  });
  okStatus('create ' + tag, r, 201);
  const woId = r.data && r.data.id;
  const groupId = r.data && r.data.groups && r.data.groups[0].id;
  check('WO id + group id present', !!woId && !!groupId, 'woId=' + woId + ' groupId=' + groupId);

  const exp = { woId, recipients: {} };

  if (granteeUserId) {
    r = await api('POST', `/api/work-orders/${woId}/access`, pm, { user_id: granteeUserId });
    okStatus('grant pm@test access ' + tag, r, 200);
    const granted = await query(`SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=$1 AND user_id=$2`, [woId, granteeUserId]);
    check('grantee row exists -> pm@test(16)', granted.rows[0].c === 1, 'c=' + granted.rows[0].c);
    exp.recipients.ACCESS_GRANTED = [1, granteeUserId];
  } else {
    r = await api('GET', `/api/work-orders/${woId}`, pm);
    okStatus('pm view own WO ' + tag, r, 200);
  }

  const itemIds = [];
  for (const it of items) {
    r = await api('POST', `/api/work-orders/${woId}/items`, pm, { work_order_group_id: groupId, title: it.title, quantity: it.quantity || 1 });
    okStatus('add item "' + it.title + '" ' + tag, r, 201);
    itemIds.push(r.data && r.data.id);
  }
  check('items added (' + itemIds.length + ')', itemIds.every((x) => x), 'ids=' + itemIds.join(','));

  // analyze
  r = await api('POST', `/api/work-orders/${woId}/analyze`, pm);
  okStatus('analyze ' + tag, r, 200);
  let st = (await query('SELECT status FROM work_orders WHERE id=$1', [woId])).rows[0].status;
  check('status ANALYZED after analyze', st === 'ANALYZED', 'status=' + st);
  const clsRows = (await query(`SELECT c.status, woi.title FROM classifications c JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1`, [woId])).rows;
  const reviewItems = clsRows.filter((c) => c.status === 'CODER_REVIEW');
  console.log('  classification statuses: ' + clsRows.map((c) => c.title + '=' + c.status).join(', '));

  // CODER_REVIEW path
  if (reviewItems.length > 0) {
    exp.recipients.CODER_REVIEW = [2, 3]; // all admins + coders
    const reviewItemIds = (await query(`SELECT woi.id FROM work_order_items woi JOIN classifications c ON c.work_order_item_id=woi.id WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW' ORDER BY woi.id`, [woId])).rows.map((x) => x.id);
    for (const itemId of reviewItemIds) {
      r = await api('POST', `/api/work-orders/items/${itemId}/review`, coder, { complexity_level_id: 3, notes: 'reviewed in LIVE test' });
      okStatus('coder review item ' + itemId, r, 200);
    }
    exp.recipients.ITEM_REVIEWED = [1]; // owner + grantees (grantee only if granteeUserId present)
    if (granteeUserId) exp.recipients.ITEM_REVIEWED.push(granteeUserId);
    r = await api('POST', `/api/work-orders/${woId}/analyze`, pm);
    okStatus('re-analyze after review ' + tag, r, 200);
    const cls2 = (await query(`SELECT COUNT(*)::int c FROM classifications c JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW'`, [woId])).rows[0].c;
    check('no CODER_REVIEW remaining after review', cls2 === 0, 'c=' + cls2);
  }

  // finalize (PM)
  r = await api('POST', `/api/work-orders/${woId}/finalize`, pm);
  okStatus('finalize ' + tag, r, 200);
  const tasks = (r.data && r.data.production_tasks) || [];
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [woId])).rows[0].status;
  check('status FINALIZED', st === 'FINALIZED', 'status=' + st);
  check('production tasks generated (' + tasks.length + ')', tasks.length >= 1, 'tasks=' + tasks.length);

  // WO_FINALIZED recipients = owner + grantees + admins + coders
  const baseRecip = [1, 2, 3];
  if (granteeUserId) baseRecip.push(granteeUserId);
  exp.recipients.WO_FINALIZED = baseRecip.slice();

  // RBAC: pm cannot start production
  r = await api('POST', `/api/work-orders/${woId}/production`, pm);
  check('pm startProduction 403 ' + tag, r.status === 403, 'status=' + r.status);

  // start production (CODER)
  r = await api('POST', `/api/work-orders/${woId}/production`, coder);
  okStatus('startProduction ' + tag, r, 200);
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [woId])).rows[0].status;
  check('status PRODUCTION', st === 'PRODUCTION', 'status=' + st);

  // complete tasks
  for (const t of tasks) {
    r = await api('PUT', `/api/work-orders/${woId}/production/tasks/${t.id}`, coder, { completed: true });
    okStatus('complete task ' + t.id + ' ' + tag, r, 200);
  }

  // complete production
  r = await api('POST', `/api/work-orders/${woId}/production/complete`, coder);
  okStatus('completeProduction ' + tag, r, 200);
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [woId])).rows[0].status;
  check('status COMPLETED', st === 'COMPLETED', 'status=' + st);
  exp.recipients.WO_COMPLETED = baseRecip.slice();

  // final state
  r = await api('GET', `/api/work-orders/${woId}`, pm);
  check('GET final detail ' + tag, r.status === 200 && r.data && r.data.status === 'COMPLETED', 'status=' + (r.data && r.data.status));
  const openTasks = (await query('SELECT COUNT(*)::int c FROM production_tasks WHERE work_order_id=$1 AND completed=FALSE', [woId])).rows[0].c;
  check('no open production tasks', openTasks === 0, 'open=' + openTasks);

  expectations.push(exp);
  results[tag] = { woId, woNumber, status: st, items: itemIds };
}

function hasSubset(actualSet, expected) { return expected.every((u) => actualSet.has(u)); }

(async () => {
  const ts = Date.now();
  await runWo({ tag: 'A', woNumber: 'LIVETEST-A-' + ts, granteeUserId: 16, items: [
    { title: 'menu tree modification', quantity: 2 },
    { title: 'ui text change', quantity: 1 },
    { title: 'closed-loop control', quantity: 1 },
  ]});
  await runWo({ tag: 'B', woNumber: 'LIVETEST-B-' + ts, granteeUserId: null, items: [
    { title: 'Mergepoint', quantity: 1 },
    { title: 'io configuration change', quantity: 1 },
  ]});

  // ---- Final settled-state notification verification (deterministic) ----
  console.log('\n===== NOTIFICATION VERIFICATION (settled DB + API) =====');
  const userRows = await query('SELECT id, username FROM users WHERE id IN (1,2,3,16) ORDER BY id');
  const matrix = [];

  for (const exp of expectations) {
    const prov = (await query(`SELECT DISTINCT user_id FROM notifications WHERE entity_id=$1 AND status=$2`, [exp.woId, 'ACCESS_GRANTED'])).rows.map((x) => x.user_id);
    if (exp.recipients.ACCESS_GRANTED) {
      check(`ACCESS_GRANTED ${exp.woId} -> {${exp.recipients.ACCESS_GRANTED.join(',')}}`,
        prov.length === exp.recipients.ACCESS_GRANTED.length && hasSubset(new Set(prov), exp.recipients.ACCESS_GRANTED),
        'actual={' + prov.join(',') + '}');
    } else {
      check(`ACCESS_GRANTED absent ${exp.woId}`, prov.length === 0, 'actual={' + prov.join(',') + '}');
    }
    for (const status of ['CODER_REVIEW', 'ITEM_REVIEWED', 'WO_FINALIZED', 'WO_COMPLETED']) {
      const expectList = exp.recipients[status] || [];
      const got = (await query(`SELECT DISTINCT user_id FROM notifications WHERE entity_id=$1 AND status=$2`, [exp.woId, status])).rows.map((x) => x.user_id);
      if (expectList.length === 0) {
        check(`${status} absent ${exp.woId}`, got.length === 0, 'actual={' + got.join(',') + '}');
      } else {
        check(`${status} ${exp.woId} -> {${expectList.join(',')}}`,
          got.length === expectList.length && hasSubset(new Set(got), expectList),
          'actual={' + got.join(',') + '} expect={' + expectList.join(',') + '}');
      }
    }
  }

  // Per-user matrix via DB across both scratch WOs
  const woIds = expectations.map((e) => e.woId);
  console.log('\n----- PER-USER NOTIFICATION MATRIX (DB) -----');
  for (const u of userRows.rows) {
    const n = await query('SELECT status, entity_id FROM notifications WHERE user_id=$1 AND entity_id = ANY($2)', [u.id, woIds]);
    const byStatus = {};
    for (const d of n.rows) byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    matrix.push({ user: u.id, username: u.username, byStatus });
    console.log('user ' + u.id + ' (' + u.username + '): rows=' + n.rows.length + ' ' + JSON.stringify(byStatus));
  }

  // Per-user API surface check (GET /api/notifications)
  console.log('\n----- API /api/notifications per user -----');
  for (const u of userRows.rows) {
    const token = await loginUserId(u.id);
    const nr = await api('GET', '/api/notifications', token);
    const list = Array.isArray(nr.data) ? nr.data : [];
    const mine = list.filter((x) => woIds.includes(x.entity_id));
    check('API user ' + u.id + ' sees their scratch notifications', nr.status === 200 && mine.length >= 1,
      'status=' + nr.status + ' visible=' + mine.length);
  }

  // every user got WO_FINALIZED + WO_COMPLETED
  for (const u of userRows.rows) {
    const n = await query('SELECT DISTINCT status FROM notifications WHERE user_id=$1 AND entity_id = ANY($2)', [u.id, woIds]);
    const set = new Set(n.rows.map((x) => x.status));
    check('user ' + u.id + ' received WO_FINALIZED', set.has('WO_FINALIZED'), 'statuses=[' + [...set].join(',') + ']');
    check('user ' + u.id + ' received WO_COMPLETED', set.has('WO_COMPLETED'), 'statuses=[' + [...set].join(',') + ']');
  }

  console.log('\nFINAL: ' + JSON.stringify(results));
  console.log('=== ' + pass + ' PASS / ' + fail + ' FAIL ===');
  if (failLines.length) { console.log('FAILED:'); failLines.forEach((l) => console.log('  - ' + l)); }

  require('fs').writeFileSync('C:/Program Files/Firmware Custom/tempLiveTest/_results.json',
    JSON.stringify({ results, matrix, woIds, pass, fail }, null, 2));
  pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });
