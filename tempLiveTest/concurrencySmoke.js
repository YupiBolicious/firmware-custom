// Concurrency / duplicate-submit smoke (post-hardening, 2026-09-18)
// Re-runnable. Drives scratch work orders through the state machine and fires
// CONCURRENT duplicate requests at each guarded transition, then asserts the
// settled DB state (no duplicate rows, correct final status, baselines intact).
// Requires backend on :5000. Cleans up all scratch rows before exiting.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com', admin: 'admin@demo.com' };
const PW = 'password123';

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
  if (!r.data || !r.data.token) throw new Error('login failed for ' + key + ' status=' + r.status);
  return r.data.token;
}

let pass = 0, fail = 0, skipped = 0;
const failLines = [], skipLines = [], notes = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; failLines.push(name + (detail ? '  [' + detail + ']' : '')); console.log('FAIL ' + name + ' -> ' + detail); }
}
function skip(name, why) { skipped++; skipLines.push(name + ' (' + why + ')'); console.log('SKIP ' + name + ' -> ' + why); }
function okStatus(name, r, want) {
  check(name + ' ' + want, r.status === want, 'status=' + r.status + (r.json && r.json.message ? ' "' + r.json.message + '"' : ''));
}
const sorted = (a) => [a[0].status, a[1].status].sort((x, y) => x - y);

(async () => {
  const ts = Date.now();
  const scratchWoIds = [];
  const createdWoNumbers = [];

  // ---------- precondition ----------
  const health = await api('GET', '/api/health');
  check('backend /api/health 200', health.status === 200, 'status=' + health.status);

  const [pm, coder, admin] = await Promise.all([login('pm'), login('coder'), login('admin')]);

  const model = (await query(
    `SELECT mm.id AS model_id, mmv.id AS version_id
     FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
     ORDER BY mm.id, mmv.id LIMIT 1`
  )).rows[0];
  if (!model) throw new Error('no machine model/version seeded');
  const groupRef = () => [{ machine_model_id: model.model_id, machine_model_version_id: model.version_id, serial_number: 'smoke-' + Date.now() }];

  const usersBefore = (await query('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  const dupGroupsBefore = (await query(
    `SELECT COUNT(*)::int c FROM (
       SELECT classification_id, COALESCE(kb_item_id,0), COALESCE(rule_id,0)
       FROM classification_matches GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`
  )).rows[0].c;
  console.log('baseline: users=' + usersBefore + ' dupMatchGroups=' + dupGroupsBefore);

  // ---------- indexes / DDL shipped ----------
  const idx = (await query(`SELECT indexname FROM pg_indexes WHERE tablename='classification_matches'`)).rows.map((x) => x.indexname);
  check('uq_classification_matches_entity exists', idx.includes('uq_classification_matches_entity'), 'indexes=' + idx.join(','));
  const accessUnique = (await query(
    `SELECT COUNT(*)::int c FROM pg_indexes WHERE tablename='work_order_access'
       AND indexdef LIKE '%(work_order_id, user_id)%'`
  )).rows[0].c;
  check('work_order_access unique pair exists', accessUnique >= 1, 'c=' + accessUnique);

  async function createWo(tag, items) {
    const woNumber = `SMOKE-${tag}-${ts}`;
    createdWoNumbers.push(woNumber);
    const r = await api('POST', '/api/work-orders', pm, {
      wo_number: woNumber, title: 'SMOKE ' + tag, description: 'concurrency smoke', customer: 'QA',
      groups: groupRef(),
    });
    okStatus(`create WO ${tag}`, r, 201);
    const woId = r.data && r.data.id;
    const groupId = r.data && r.data.groups && r.data.groups[0].id;
    check(`WO ${tag} id + group`, !!woId && !!groupId, 'woId=' + woId + ' groupId=' + groupId);
    if (woId) scratchWoIds.push(woId);
    const itemIds = [];
    for (const title of items) {
      const ir = await api('POST', `/api/work-orders/${woId}/items`, pm, { work_order_group_id: groupId, title, quantity: 1 });
      okStatus(`add item "${title}" (${tag})`, ir, 201);
      itemIds.push(ir.data && ir.data.id);
    }
    return { woId, woNumber, itemIds };
  }

  // =========================================================
  // WO A — guarded state machine (create/analyze/finalize/start/task/complete)
  // =========================================================
  console.log('\n===== WO A: state machine + concurrent duplicates =====');

  // duplicate create (same wo_number, concurrent)
  const dupNumber = `SMOKE-DUP-${ts}`;
  createdWoNumbers.push(dupNumber);
  const dupBody = { wo_number: dupNumber, title: 'SMOKE DUP', description: 'dup', customer: 'QA', groups: groupRef() };
  const dup = await Promise.all([
    api('POST', '/api/work-orders', pm, dupBody),
    api('POST', '/api/work-orders', pm, dupBody),
  ]);
  const dupSorted = sorted(dup);
  check('dup WO create -> one 201 + one 409', dupSorted[0] === 201 && dupSorted[1] === 409, 'statuses=' + dupSorted);
  const dupRows = await query('SELECT id FROM work_orders WHERE wo_number=$1', [dupNumber]);
  check('dup WO row count = 1', dupRows.rows.length === 1, 'c=' + dupRows.rows.length);
  if (dupRows.rows[0]) scratchWoIds.push(dupRows.rows[0].id);

  const A = await createWo('A', ['Menu tree modification', 'Update UI text', 'Cosmetic defect on display housing']);
  if (!A.woId) throw new Error('WO A creation failed; aborting');
  const aItems = (await query('SELECT id FROM work_order_items WHERE work_order_id=$1 ORDER BY id', [A.woId])).rows.map((x) => x.id);

  // concurrent analyze x2
  const an = await Promise.all([
    api('POST', `/api/work-orders/${A.woId}/analyze`, pm),
    api('POST', `/api/work-orders/${A.woId}/analyze`, pm),
  ]);
  check('double analyze -> both 200 (idempotent)', an[0].status === 200 && an[1].status === 200, 'statuses=' + sorted(an));
  let st = (await query('SELECT status FROM work_orders WHERE id=$1', [A.woId])).rows[0].status;
  check('WO A status ANALYZED', st === 'ANALYZED', 'status=' + st);
  const clsCount = (await query(
    `SELECT COUNT(*)::int c FROM classifications c JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1`, [A.woId]
  )).rows[0].c;
  check('one classification per item after double analyze', clsCount === aItems.length, 'c=' + clsCount + ' expected=' + aItems.length);
  const matchDup = (await query(
    `SELECT COUNT(*)::int c FROM (
       SELECT classification_id, COALESCE(kb_item_id,0), COALESCE(rule_id,0)
       FROM classification_matches m
       JOIN classifications c ON c.id=m.classification_id
       JOIN work_order_items woi ON woi.id=c.work_order_item_id
       WHERE woi.work_order_id=$1 GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`, [A.woId]
  )).rows[0].c;
  check('no duplicate classification_matches after double analyze', matchDup === 0, 'dupGroups=' + matchDup);

  // precondition: all A items must be resolved before finalize (else it 400s with
  // "awaiting coder review"). The coder-learning corpus drifts between runs, so fill
  // any CODER_REVIEW leftovers via sequential review instead of pinning titles forever.
  const pendingRev = (await query(
    `SELECT c.work_order_item_id AS id FROM classifications c
     JOIN work_order_items woi ON woi.id=c.work_order_item_id
     WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW' ORDER BY 1`, [A.woId]
  )).rows;
  for (const p of pendingRev) {
    const pr = await api('POST', `/api/work-orders/items/${p.id}/review`, coder, { complexity_level_id: 3, notes: 'smoke fill' });
    check('fill-review unresolved item ' + p.id, pr.status === 200, 'status=' + pr.status + ' "' + (pr.json && pr.json.message) + '"');
  }
  const unresolved = (await query(
    `SELECT COUNT(*)::int c FROM classifications c
     JOIN work_order_items woi ON woi.id=c.work_order_item_id
     WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW'`, [A.woId]
  )).rows[0].c;
  check('all WO A items resolved before finalize', unresolved === 0, 'stillAwaitingReview=' + unresolved);

  // concurrent finalize x2
  const fin = await Promise.all([
    api('POST', `/api/work-orders/${A.woId}/finalize`, pm),
    api('POST', `/api/work-orders/${A.woId}/finalize`, pm),
  ]);
  const finSorted = sorted(fin);
  const fin200 = finSorted.filter((s) => s === 200).length;
  check('double finalize -> >=1 success, other is 4xx (not 5xx)',
    fin200 >= 1 && finSorted.every((s) => s === 200 || (s >= 400 && s < 500)), 'statuses=' + finSorted);
  notes.push('double finalize statuses=' + finSorted);
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [A.woId])).rows[0].status;
  check('WO A status FINALIZED', st === 'FINALIZED', 'status=' + st);
  const taskDup = (await query(
    `SELECT COUNT(*)::int c FROM (SELECT work_order_item_id FROM production_tasks WHERE work_order_id=$1 GROUP BY work_order_item_id HAVING COUNT(*)>1) x`, [A.woId]
  )).rows[0].c;
  check('no duplicate production_tasks', taskDup === 0, 'dupGroups=' + taskDup);

  // concurrent start production x2
  const start = await Promise.all([
    api('POST', `/api/work-orders/${A.woId}/production`, coder),
    api('POST', `/api/work-orders/${A.woId}/production`, coder),
  ]);
  const startSorted = sorted(start);
  check('double startProduction -> exactly one 200 + one 400/409',
    startSorted.filter((s) => s === 200).length === 1 && startSorted.every((s) => s === 200 || s === 400 || s === 409),
    'statuses=' + startSorted);
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [A.woId])).rows[0].status;
  check('WO A status PRODUCTION', st === 'PRODUCTION', 'status=' + st);

  // task toggles (sequential conflict-free; concurrent double-toggle is benign last-write-wins)
  const tasks = (await query('SELECT id FROM production_tasks WHERE work_order_id=$1 ORDER BY id', [A.woId])).rows.map((x) => x.id);
  check('production tasks generated', tasks.length >= 1, 'tasks=' + tasks.length);
  for (const t of tasks) {
    const tr = await api('PUT', `/api/work-orders/${A.woId}/production/tasks/${t}`, coder, { completed: true });
    okStatus('complete task ' + t, tr, 200);
  }
  // close out any task that finalize created after our snapshot
  await query('UPDATE production_tasks SET completed=TRUE WHERE work_order_id=$1 AND completed=FALSE', [A.woId]);

  // fixture: this WO's items all carry complexity, which makes completeProduction
  // require documents (upload auto-completes). Null complexity so the MANUAL
  // complete transition is reachable and the guard can be exercised.
  const itemIdsA = (await query('SELECT id FROM work_order_items WHERE work_order_id=$1', [A.woId])).rows.map((x) => x.id);
  await query('UPDATE classifications SET complexity_level_id=NULL WHERE work_order_item_id = ANY($1)', [itemIdsA]);

  // concurrent complete production x2
  const comp = await Promise.all([
    api('POST', `/api/work-orders/${A.woId}/production/complete`, coder),
    api('POST', `/api/work-orders/${A.woId}/production/complete`, coder),
  ]);
  const compSorted = sorted(comp);
  check('double completeProduction -> exactly one 200 + one 400/409',
    compSorted.filter((s) => s === 200).length === 1 && compSorted.every((s) => s === 200 || s === 400 || s === 409),
    'statuses=' + compSorted);
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [A.woId])).rows[0].status;
  check('WO A status COMPLETED', st === 'COMPLETED', 'status=' + st);

  // task toggle AFTER completion must now 409 (reopen-after-complete gate)
  const reopen = await api('PUT', `/api/work-orders/${A.woId}/production/tasks/${tasks[0]}`, coder, { completed: false });
  check('task toggle after COMPLETED -> 4xx (guard)',
    reopen.status === 409 || reopen.status === 400,
    'status=' + reopen.status + ' "' + (reopen.json && reopen.json.message) + '"');

  // grant duplicate (concurrent + sequential) — row must stay single
  const grantee = (await query(
    `SELECT id FROM users WHERE username NOT IN ('pm@demo','coder@demo','admin@demo') AND is_active=TRUE ORDER BY id LIMIT 1`
  )).rows[0];
  if (grantee) {
    await Promise.all([
      api('POST', `/api/work-orders/${A.woId}/access`, pm, { user_id: grantee.id }),
      api('POST', `/api/work-orders/${A.woId}/access`, pm, { user_id: grantee.id }),
    ]);
    const gr = await api('POST', `/api/work-orders/${A.woId}/access`, pm, { user_id: grantee.id });
    check('duplicate grant returns non-5xx', gr.status < 500, 'status=' + gr.status);
    const accessRows = (await query('SELECT COUNT(*)::int c FROM work_order_access WHERE work_order_id=$1 AND user_id=$2', [A.woId, grantee.id])).rows[0].c;
    check('work_order_access row count = 1 after triple grant', accessRows === 1, 'c=' + accessRows);
  } else {
    skip('duplicate grant', 'no non-demo grantee user');
  }

  // =========================================================
  // WO B — coder review double-submit (conditional status guard)
  // =========================================================
  console.log('\n===== WO B: coder review double-submit =====');
  const B = await createWo('B', ['MXQ ' + ts + ' kbeta req']);
  if (!B.woId) throw new Error('WO B creation failed; aborting');
  await api('POST', `/api/work-orders/${B.woId}/analyze`, pm);
  const reviewItem = (await query(
    `SELECT woi.id FROM work_order_items woi JOIN classifications c ON c.work_order_item_id=woi.id
     WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW' ORDER BY woi.id LIMIT 1`, [B.woId]
  )).rows[0];
  if (reviewItem) {
    const rev = await Promise.all([
      api('POST', `/api/work-orders/items/${reviewItem.id}/review`, coder, { complexity_level_id: 3, notes: 'smoke' }),
      api('POST', `/api/work-orders/items/${reviewItem.id}/review`, coder, { complexity_level_id: 3, notes: 'smoke' }),
    ]);
    const revSorted = sorted(rev);
    check('double review -> exactly one 200 + one 400/409', revSorted[0] === 200 && (revSorted[1] === 400 || revSorted[1] === 409), 'statuses=' + revSorted);
    const cl = (await query('SELECT status, reviewed_by, confidence_score FROM classifications WHERE work_order_item_id=$1', [reviewItem.id])).rows[0];
    check('review settled: status/confidence/reviewed_by',
      cl && ['CLASSIFIED', 'NON_FIRMWARE'].includes(cl.status) && Number(cl.confidence_score) === 100 && cl.reviewed_by != null,
      JSON.stringify(cl));
    const estRows = (await query('SELECT COUNT(*)::int c FROM item_estimations WHERE work_order_item_id=$1', [reviewItem.id])).rows[0].c;
    check('single estimation row after double review', estRows <= 1, 'c=' + estRows);
    const re = await api('POST', `/api/work-orders/${B.woId}/analyze`, pm);
    okStatus('re-analyze after review (B)', re, 200);
  } else {
    skip('double review', 'no CODER_REVIEW item produced');
  }

  // =========================================================
  // WO C — document upload auto-complete (gated PRODUCTION->COMPLETED)
  // =========================================================
  console.log('\n===== WO C: document upload auto-complete =====');
  const C = await createWo('C', ['menu tree modification', 'ui text change']);
  if (!C.woId) throw new Error('WO C creation failed; aborting');
  await api('POST', `/api/work-orders/${C.woId}/analyze`, pm);
  await api('POST', `/api/work-orders/${C.woId}/finalize`, pm);
  await api('POST', `/api/work-orders/${C.woId}/production`, coder);
  const form = new FormData();
  form.append('files', new Blob(['SMOKE DOC ' + ts], { type: 'text/plain' }), 'smoke-' + ts + '.txt');
  const up = await api('POST', `/api/work-orders/${C.woId}/documents`, coder, form, form);
  okStatus('upload doc while PRODUCTION', up, 201);
  st = (await query('SELECT status FROM work_orders WHERE id=$1', [C.woId])).rows[0].status;
  check('WO C auto-COMPLETED on doc upload', st === 'COMPLETED', 'status=' + st);
  const docs = await api('GET', `/api/work-orders/${C.woId}/documents`, pm);
  check('documents list shows uploaded file', docs.status === 200 && Array.isArray(docs.data) && docs.data.length === 1, 'status=' + docs.status + ' n=' + (docs.data && docs.data.length));

  // =========================================================
  // Surface sanity (endpoints the frontend pages call)
  // =========================================================
  console.log('\n===== page-surface sanity =====');
  const surfaces = [
    ['pm', '/api/dashboard'], ['pm', '/api/pm-dashboard'], ['pm', '/api/work-orders'],
    ['pm', '/api/notifications'], ['pm', '/api/notifications/unread-count'],
    ['coder', '/api/coder-dashboard'], ['coder', '/api/work-orders/review-queue'],
    ['admin', '/api/admin-dashboard'], ['admin', '/api/kb'], ['admin', '/api/users'],
    ['admin', '/api/audit-log'],
  ];
  const tok = { pm, coder, admin };
  for (const [who, path] of surfaces) {
    const r = await api('GET', path, tok[who]);
    check(`GET ${path} (${who}) 200`, r.status === 200, 'status=' + r.status);
  }
  // notifications unread-count shape
  const uc = await api('GET', '/api/notifications/unread-count', pm);
  check('unread-count returns numeric field', uc.status === 200 && uc.data && typeof uc.data.count !== 'undefined', JSON.stringify(uc.data));

  // =========================================================
  // Cleanup + baseline restore
  // =========================================================
  console.log('\n===== cleanup =====');
  const ids = scratchWoIds.filter(Boolean);
  if (ids.length) {
    const itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [ids])).rows.map((x) => x.id);
    const taskIds = (await query('SELECT id FROM production_tasks WHERE work_order_id = ANY($1)', [ids])).rows.map((x) => x.id);
    await query(`DELETE FROM notifications WHERE entity_id = ANY($1)`, [ids]);
    await query(
      `DELETE FROM audit_trail WHERE work_order_id = ANY($1)
         OR (entity_type='WORK_ORDER' AND entity_id = ANY($1))
         OR (entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($2))
         OR (entity_type='PRODUCTION_TASK' AND entity_id = ANY($3))`,
      [ids, itemIds, taskIds]
    );
    await query(
      `DELETE FROM classification_matches WHERE classification_id IN
         (SELECT id FROM classifications WHERE work_order_item_id IN
           (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))`, [ids]
    );
    await query(`DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [ids]);
    await query(`DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [ids]);
    await query(`DELETE FROM production_tasks WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_order_documents WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_order_access WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_order_items WHERE work_order_id = ANY($1)`, [ids]);
    // coder-review path teaches the live corpus per scratch item (KB-CODER-<itemId>);
    // delete our learned rows so the corpus is stable across runs.
    if (itemIds.length) {
      await query(`DELETE FROM kb_items WHERE kb_code = ANY($1)`, [itemIds.map((i) => `KB-CODER-${i}`)]);
    }
    await query(`DELETE FROM work_order_groups WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_orders WHERE id = ANY($1)`, [ids]);
  }

  const usersAfter = (await query('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  check('user count restored (' + usersBefore + ')', usersAfter === usersBefore, 'before=' + usersBefore + ' after=' + usersAfter);
  const scratchLeft = (await query(`SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE 'SMOKE-%'`)).rows[0].c;
  check('no scratch WOs left', scratchLeft === 0, 'c=' + scratchLeft);
  const dupGroupsAfter = (await query(
    `SELECT COUNT(*)::int c FROM (
       SELECT classification_id, COALESCE(kb_item_id,0), COALESCE(rule_id,0)
       FROM classification_matches GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`
  )).rows[0].c;
  check('no duplicate classification_matches globally', dupGroupsAfter === 0, 'c=' + dupGroupsAfter);

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL / ' + skipped + ' SKIP =====');
  if (failLines.length) { console.log('FAILED:'); failLines.forEach((l) => console.log('  - ' + l)); }
  if (skipLines.length) { console.log('SKIPPED:'); skipLines.forEach((l) => console.log('  - ' + l)); }
  if (notes.length) { console.log('NOTES:'); notes.forEach((l) => console.log('  - ' + l)); }

  require('fs').writeFileSync(
    'C:/Program Files/Firmware Custom/tempLiveTest/_concurrency-results.json',
    JSON.stringify({ ts, pass, fail, skipped, failLines, skipLines, notes, woNumbers: createdWoNumbers }, null, 2)
  );

  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });
