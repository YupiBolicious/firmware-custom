// State-transition protection + safe fallback/error-handling smoke (2026-09-18).
// Re-runnable, self-cleaning. Drives scratch WOs through every guarded transition
// (legal + illegal), probes envelope/error-handling contracts, and in --killswitch
// mode asserts the SEMANTIC_ENABLED=0 kill switch degrades to pure lexical behavior.
// Requires backend on :5000 (killswitch mode requires a boot with SEMANTIC_ENABLED=0).
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com' };
const PW = 'password123';
const PREFIX = 'SF-';

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
function envelope(name, r, want) {
  const ok = r.status === want && r.json !== null && r.json.success === false
    && typeof r.json.message === 'string' && Array.isArray(r.json.errors);
  check(name + ' -> ' + want + ' envelope', ok,
    'status=' + r.status + ' success=' + (r.json && r.json.success) + ' message=' + (r.json ? JSON.stringify(r.json.message) : 'null'));
}
const sorted = (a) => [a[0].status, a[1].status].sort((x, y) => x - y);

const fs = require('fs');
const RESULTS_PATH = 'C:/Program Files/Firmware Custom/tempLiveTest/_statefallback-results.json';

(async () => {
  const ts = Date.now();
  const killswitch = process.argv[2] === '--killswitch';
  const scratchWoIds = [];
  const createdWoNumbers = [];

  if (killswitch) {
    console.log('===== KILL-SWITCH LEG (SEMANTIC_ENABLED=0) =====');
    const health = await api('GET', '/api/health');
    check('backend /api/health 200', health.status === 200, 'status=' + health.status);
  }

  const [pm, coder] = await Promise.all([login('pm'), login('coder')]);

  const model = (await query(
    `SELECT mm.id AS model_id, mmv.id AS version_id
     FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
     ORDER BY mm.id, mmv.id LIMIT 1`
  )).rows[0];
  if (!model) throw new Error('no machine model/version seeded');
  const groupRef = (sn) => [{ machine_model_id: model.model_id, machine_model_version_id: model.version_id, serial_number: sn || ('sf-' + Date.now()) }];

  async function createWo(tag, items, serial) {
    const woNumber = PREFIX + tag + '-' + ts;
    createdWoNumbers.push(woNumber);
    const r = await api('POST', '/api/work-orders', pm, {
      wo_number: woNumber, title: 'SF ' + tag, description: 'state-fallback smoke', customer: 'QA',
      groups: groupRef(serial),
    });
    const woId = r.data && r.data.id;
    const groupId = r.data && r.data.groups && r.data.groups[0].id;
    const itemIds = [];
    for (const title of items) {
      const ir = await api('POST', `/api/work-orders/${woId}/items`, pm, { work_order_group_id: groupId, title, quantity: 1 });
      if (ir.status === 201) itemIds.push(ir.data.id);
    }
    if (woId) scratchWoIds.push(woId);
    return { woId, groupId, itemIds, woNumber };
  }

  async function fillReview(woId) {
    const pending = (await query(
      `SELECT c.work_order_item_id AS id FROM classifications c
       JOIN work_order_items woi ON woi.id=c.work_order_item_id
       WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW' ORDER BY 1`, [woId]
    )).rows;
    for (const p of pending) {
      await api('POST', `/api/work-orders/items/${p.id}/review`, coder, { complexity_level_id: 3, notes: 'sf fill' });
    }
    return pending.length;
  }

  // ---------- semantic probe WO (used by both legs) ----------
  const K = await createWo('K', ['MXQ sigma kbeta'], 'sf-k-' + ts);
  const kan = await api('POST', `/api/work-orders/${K.woId}/analyze`, pm);
  check('K analyze 200 (semantic probe)', kan.status === 200, 'status=' + kan.status);
  const kperf = kan.data && kan.data.perf;
  const kSemanticHits = kperf ? kperf.semanticHits : null;
  const kItems = kan.data && kan.data.results;
  const kSuggest = (kItems || []).filter((i) => i.semantic_suggestion);
  if (killswitch) {
    check('kill-switch: semanticHits = 0', kSemanticHits === 0, 'semanticHits=' + kSemanticHits);
    check('kill-switch: no SEMANTIC_ASSIST suggestion', kSuggest.length === 0, 'suggestions=' + kSuggest.length);
    const kOpts = (await query('SELECT code, name FROM complexity_levels ORDER BY id LIMIT 6')).rows;
    check('kill-switch: complexity levels still served', kOpts.length >= 5, 'levels=' + kOpts.length);
  } else {
    notes.push('semantic probe (enabled): semanticHits=' + kSemanticHits + ' assistSuggestions=' + kSuggest.length
      + (kSuggest.length ? ' top=' + kSuggest[0].semantic_suggestion.kb_code : ''));
    check('semantic probe: analyze never 5xx on enabled boot', kan.status === 200, 'status=' + kan.status);
  }

  if (!killswitch) {
    // =========================================================
    // WO A — full transition matrix
    // =========================================================
    console.log('\n===== WO A: state-transition matrix =====');
    const A = await createWo('A', ['Menu tree modification', 'Update UI text', 'Cosmetic defect on display housing']);
    const Aid = A.woId;
    check('create SF-A 201 -> DRAFT', !!Aid, 'woId=' + Aid);

    // DRAFT guards
    let r = await api('POST', `/api/work-orders/${Aid}/finalize`, pm);
    envelope('finalize from DRAFT', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/production`, coder);
    envelope('startProduction from DRAFT', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/production/complete`, coder);
    envelope('completeProduction from DRAFT', r, 400);
    const badDocForm = new FormData();
    badDocForm.append('files', new Blob(['x'], { type: 'text/plain' }), 'sf-orphan-' + ts + '.txt');
    r = await api('POST', `/api/work-orders/${Aid}/documents`, coder, badDocForm, badDocForm);
    envelope('doc upload from DRAFT', r, 400);

    // groups editable pre-finalization
    const g2 = await api('POST', `/api/work-orders/${Aid}/groups`, pm, groupRef('sf-g2-' + ts)[0]);
    check('add group while DRAFT 201', g2.status === 201, 'status=' + g2.status);
    if (g2.data && g2.data.id) {
      const gd = await api('DELETE', `/api/work-orders/${Aid}/groups/${g2.data.id}`, pm);
      check('delete empty group 200', gd.status === 200, 'status=' + gd.status);
    }

    let st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('WO A still DRAFT', st === 'DRAFT', 'status=' + st);

    // analyze
    const an = await api('POST', `/api/work-orders/${Aid}/analyze`, pm);
    check('analyze 200', an.status === 200, 'status=' + an.status);
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('WO A ANALYZED', st === 'ANALYZED', 'status=' + st);
    const an2 = await api('POST', `/api/work-orders/${Aid}/analyze`, pm);
    check('re-analyze idempotent 200', an2.status === 200, 'status=' + an2.status);

    // ANALYZED guards
    r = await api('POST', `/api/work-orders/${Aid}/production`, coder);
    envelope('startProduction from ANALYZED', r, 400);
    const badDocForm2 = new FormData();
    badDocForm2.append('files', new Blob(['x'], { type: 'text/plain' }), 'sf-orphan2-' + ts + '.txt');
    r = await api('POST', `/api/work-orders/${Aid}/documents`, coder, badDocForm2, badDocForm2);
    envelope('doc upload from ANALYZED', r, 400);

    // item add while ANALYZED -> auto-reset to DRAFT
    const ia = await api('POST', `/api/work-orders/${Aid}/items`, pm, { work_order_group_id: A.groupId, title: 'Mechanical label change', quantity: 1 });
    check('add item while ANALYZED 201', ia.status === 201, 'status=' + ia.status);
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('item add auto-resets ANALYZED -> DRAFT', st === 'DRAFT', 'status=' + st);

    // back to ANALYZED
    const an3 = await api('POST', `/api/work-orders/${Aid}/analyze`, pm);
    check('re-analyze after item add 200', an3.status === 200, 'status=' + an3.status);
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('WO A ANALYZED again', st === 'ANALYZED', 'status=' + st);

    const filled = await fillReview(Aid);
    notes.push('fill-review count=' + filled + ' (corpus-driven, not a defect)');

    // finalize idempotency
    const fin = await Promise.all([
      api('POST', `/api/work-orders/${Aid}/finalize`, pm),
      api('POST', `/api/work-orders/${Aid}/finalize`, pm),
    ]);
    check('double finalize -> one 200, other {200,409} (gated race, woS:698)', [200, 200, 200, 409].includes(sorted(fin)[0]) && [200, 200, 200, 409].includes(sorted(fin)[1]), 'statuses=' + sorted(fin));
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('WO A FINALIZED', st === 'FINALIZED', 'status=' + st);

    // FINALIZED guards
    r = await api('POST', `/api/work-orders/${Aid}/analyze`, pm);
    envelope('analyze from FINALIZED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/items`, pm, { work_order_group_id: A.groupId, title: 'X', quantity: 1 });
    envelope('add item from FINALIZED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/groups`, pm, groupRef('sf-g3-' + ts)[0]);
    envelope('add group from FINALIZED', r, 400);
    const badDocForm3 = new FormData();
    badDocForm3.append('files', new Blob(['x'], { type: 'text/plain' }), 'sf-orphan3-' + ts + '.txt');
    r = await api('POST', `/api/work-orders/${Aid}/documents`, coder, badDocForm3, badDocForm3);
    envelope('doc upload from FINALIZED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/finalize`, pm);
    check('finalize again from FINALIZED 200 (idempotent)', r.status === 200, 'status=' + r.status);

    // start production
    r = await api('POST', `/api/work-orders/${Aid}/production`, coder);
    check('startProduction 200', r.status === 200, 'status=' + r.status);
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('WO A PRODUCTION', st === 'PRODUCTION', 'status=' + st);

    // PRODUCTION guards
    r = await api('POST', `/api/work-orders/${Aid}/analyze`, pm);
    envelope('analyze from PRODUCTION', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/finalize`, pm);
    envelope('finalize from PRODUCTION', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/items`, pm, { work_order_group_id: A.groupId, title: 'X', quantity: 1 });
    envelope('add item from PRODUCTION', r, 400);

    // tasks + complete guards
    const tasks = (await query('SELECT id FROM production_tasks WHERE work_order_id=$1 ORDER BY id', [Aid])).rows.map((x) => x.id);
    check('production tasks generated', tasks.length >= 1, 'tasks=' + tasks.length);
    for (let i = 0; i + 1 < tasks.length; i++) {
      const tr = await api('PUT', `/api/work-orders/${Aid}/production/tasks/${tasks[i]}`, coder, { completed: true });
      check('complete task ' + tasks[i] + ' 200', tr.status === 200, 'status=' + tr.status);
    }
    r = await api('POST', `/api/work-orders/${Aid}/production/complete`, coder);
    envelope('complete with ' + (tasks.length === 1 ? 1 : 0) + ' open task' + (tasks.length === 1 ? '' : 's'), r, 400);
    if (tasks.length >= 1) {
      const tr = await api('PUT', `/api/work-orders/${Aid}/production/tasks/${tasks[tasks.length - 1]}`, coder, { completed: true });
      check('complete last task 200', tr.status === 200, 'status=' + tr.status);
    }
    r = await api('POST', `/api/work-orders/${Aid}/production/complete`, coder);
    const needsDocs = r.status === 400 && (r.json && /documentation files are required/i.test(r.json.message));
    envelope('complete with all tasks but no docs (firmware) -> 400', r, 400);
    notes.push('complete-no-docs message=' + (r.json && r.json.message) + ' (doc guard ' + (needsDocs ? 'confirmed' : 'message differs') + ')');

    // doc upload auto-completes
    const upForm = new FormData();
    upForm.append('files', new Blob(['SF DOC ' + ts], { type: 'text/plain' }), 'sf-doc-' + ts + '.txt');
    r = await api('POST', `/api/work-orders/${Aid}/documents`, coder, upForm, upForm);
    check('doc upload in PRODUCTION 201', r.status === 201, 'status=' + r.status);
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [Aid])).rows[0].status;
    check('WO A auto-COMPLETED on doc upload', st === 'COMPLETED', 'status=' + st);

    // COMPLETED guards
    r = await api('POST', `/api/work-orders/${Aid}/analyze`, pm);
    envelope('analyze from COMPLETED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/finalize`, pm);
    envelope('finalize from COMPLETED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/production`, coder);
    envelope('startProduction from COMPLETED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/items`, pm, { work_order_group_id: A.groupId, title: 'X', quantity: 1 });
    envelope('add item from COMPLETED', r, 400);
    r = await api('POST', `/api/work-orders/${Aid}/groups`, pm, groupRef('sf-g4-' + ts)[0]);
    envelope('add group from COMPLETED', r, 400);
    const trReopen = await api('PUT', `/api/work-orders/${Aid}/production/tasks/${tasks[0]}`, coder, { completed: false });
    check('task toggle after COMPLETED -> 4xx', trReopen.status === 409 || trReopen.status === 400,
      'status=' + trReopen.status + ' "' + (trReopen.json && trReopen.json.message) + '"');
    const upForm2 = new FormData();
    upForm2.append('files', new Blob(['SF DOC 2 ' + ts], { type: 'text/plain' }), 'sf-doc2-' + ts + '.txt');
    r = await api('POST', `/api/work-orders/${Aid}/documents`, coder, upForm2, upForm2);
    check('doc upload in COMPLETED 200 (allowed)', r.status === 201, 'status=' + r.status);

    // WO-level title mutation after COMPLETED (expected: allowed — static observation)
    const putWo = await api('PUT', `/api/work-orders/${Aid}`, pm, { title: 'SF-A renamed after complete' });
    check('WO title PUT after COMPLETED 200 (gap probe)', putWo.status === 200, 'status=' + putWo.status);
    notes.push('static observation: WO-level title/customer PUT is NOT state-gated (items/groups are); returned ' + putWo.status);

    // rollback guard
    r = await api('PUT', `/api/work-orders/${Aid}`, pm, { status: 'DRAFT' });
    envelope('PUT status DRAFT from COMPLETED -> 400 (rollback only ANALYZED)', r, 400);

    // =========================================================
    // WO R — ANALYZED -> DRAFT rollback
    // =========================================================
    console.log('\n===== WO R: ANALYZED -> DRAFT rollback =====');
    const R = await createWo('R', ['Update UI text']);
    await api('POST', `/api/work-orders/${R.woId}/analyze`, pm);
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [R.woId])).rows[0].status;
    check('WO R ANALYZED', st === 'ANALYZED', 'status=' + st);
    r = await api('PUT', `/api/work-orders/${R.woId}`, pm, { status: 'DRAFT' });
    check('rollback PUT status DRAFT 200', r.status === 200, 'status=' + r.status + ' "' + (r.json && r.json.message) + '"');
    st = (await query('SELECT status FROM work_orders WHERE id=$1', [R.woId])).rows[0].status;
    check('WO R status DRAFT after rollback', st === 'DRAFT', 'status=' + st);
    const rc = (await query(
      `SELECT COUNT(*)::int c FROM classifications c
       JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1`, [R.woId]
    )).rows[0].c;
    check('rollback cleared analysis rows', rc === 0, 'classifications=' + rc);
    const rpt = (await query('SELECT COUNT(*)::int c FROM production_tasks WHERE work_order_id=$1', [R.woId])).rows[0].c;
    check('rollback deleted production_tasks', rpt === 0, 'tasks=' + rpt);
    const rn = (await query(`SELECT COUNT(*)::int c FROM notifications WHERE entity_id=$1 AND status='CODER_REVIEW'`, [R.woId])).rows[0].c;
    check('rollback deleted CODER_REVIEW notifications', rn === 0, 'notifications=' + rn);
    r = await api('POST', `/api/work-orders/${R.woId}/analyze`, pm);
    check('re-analyze after rollback 200', r.status === 200, 'status=' + r.status);

    // =========================================================
    // Error-handling / envelope probes
    // =========================================================
    console.log('\n===== error-handling & envelope probes =====');
    const dupNum = PREFIX + 'DUP-' + ts;
    createdWoNumbers.push(dupNum);
    await api('POST', '/api/work-orders', pm, { wo_number: dupNum, title: 'dup', description: 'x', customer: 'QA', groups: groupRef() });
    r = await api('POST', '/api/work-orders', pm, { wo_number: dupNum, title: 'dup', description: 'x', customer: 'QA', groups: groupRef() });
    envelope('duplicate create -> 409 envelope (service pre-check, woS:82)', r, 409);
    r = await api('GET', '/api/work-orders/999999999', pm);
    envelope('nonexistent WO -> 404 envelope', r, 404);
    r = await api('GET', '/api/work-orders/abc', pm);
    envelope('non-integer id -> 400 (requireIntegerParams)', r, 400);
    const malformed = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
    });
    let mj = null; try { mj = await malformed.json(); } catch (e) {}
    check('malformed JSON -> 400 envelope', malformed.status === 400 && mj && mj.message === 'Malformed JSON body' && mj.success === false,
      'status=' + malformed.status + ' ' + JSON.stringify(mj && mj.message));
    r = await api('GET', '/api/definitely-not-a-route');
    envelope('unknown route -> 404 envelope', r, 404);
    r = await api('POST', '/api/work-orders', pm, { wo_number: PREFIX + 'BAD-' + ts, title: 'x', groups: groupRef() });
    envelope('create missing required fields -> 400 (validation)', r, 400);
  }

  // =========================================================
  // cleanup + baseline restore (both legs)
  // =========================================================
  console.log('\n===== cleanup =====');
  const usersBefore = (await query('SELECT COUNT(*)::int c FROM users')).rows[0].c;
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
    await query(`DELETE FROM classification_matches WHERE classification_id IN
       (SELECT id FROM classifications WHERE work_order_item_id IN
         (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))`, [ids]);
    await query(`DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [ids]);
    await query(`DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [ids]);
    await query(`DELETE FROM production_tasks WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_order_documents WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_order_access WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_order_items WHERE work_order_id = ANY($1)`, [ids]);
    if (itemIds.length) await query(`DELETE FROM kb_items WHERE kb_code = ANY($1)`, [itemIds.map((i) => `KB-CODER-${i}`)]);
    await query(`DELETE FROM work_order_groups WHERE work_order_id = ANY($1)`, [ids]);
    await query(`DELETE FROM work_orders WHERE id = ANY($1)`, [ids]);
  }
  const usersAfter = (await query('SELECT COUNT(*)::int c FROM users')).rows[0].c;
  check('user count restored (' + usersBefore + ')', usersAfter === usersBefore, 'before=' + usersBefore + ' after=' + usersAfter);
  const scratchLeft = (await query(`SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE '` + PREFIX + `-%'`)).rows[0].c;
  check('no scratch WOs left', scratchLeft === 0, 'c=' + scratchLeft);
  const dupMatches = (await query(
    `SELECT COUNT(*)::int c FROM (
       SELECT classification_id, COALESCE(kb_item_id,0), COALESCE(rule_id,0)
       FROM classification_matches GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`
  )).rows[0].c;
  check('no duplicate classification_matches globally', dupMatches === 0, 'c=' + dupMatches);

  const summary = { ts, killswitch, pass, fail, skipped, failLines, skipLines, notes, woNumbers: createdWoNumbers };
  let all = {};
  try { all = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8')); } catch (e) {}
  all[killswitch ? 'killswitchLeg' : 'matrixLeg'] = summary;
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(all, null, 2));

  console.log('\n===== ' + pass + ' PASS / ' + fail + ' FAIL / ' + skipped + ' SKIP' + (killswitch ? ' (kill-switch leg)' : '') + ' =====');
  if (failLines.length) { console.log('FAILED:'); failLines.forEach((l) => console.log('  - ' + l)); }
  if (skipLines.length) { console.log('SKIPPED:'); skipLines.forEach((l) => console.log('  - ' + l)); }
  if (notes.length) { console.log('NOTES:'); notes.forEach((l) => console.log('  - ' + l)); }

  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });