// Classification / Jaccard Similarity Smoke Test
// Creates WO-C with items targeting the EXACT (>=0.60), SIMILARITY (0.35-0.60),
// and control (no-KB) Jaccard bands, runs analyze, and asserts the classifier
// tier, classification_matches rows, and that the API tier matches the
// independently-recomputed Jaccard band. Then reviews SIMILARITY items and walks
// the WO to COMPLETE. Leaves data in place for manual review.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

// exact same logic as backend/src/utils/textUtils + classificationService
const nz = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tk = (s) => new Set(nz(s).split(' ').filter(Boolean));
const jac = (a, b) => { const un = new Set([...a, ...b]); let it = 0; for (const t of a) if (b.has(t)) it++; return un.size ? it / un.size : 1; };

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
  check(name + ' ' + want, r.status === want, 'status=' + r.status + (r.json && r.json.message ? ' ' + r.json.message : ''));
}
const band = (s) => (s >= 0.6 ? 'EXACT' : (s >= 0.35 ? 'SIMILARITY' : 'OTHER'));

(async () => {
  const pm = await login('pm@demo.com', 'password123');
  const coder = await login('coder@demo.com', 'password123');
  const ts = Date.now();
  const woNumber = 'LIVETEST-C-' + ts;

  console.log('===== WO-C ' + woNumber + ' =====');
  let r = await api('POST', '/api/work-orders', pm, {
    wo_number: woNumber, title: 'Similarity Smoke', description: 'classification/jaccard', customer: 'QA',
    groups: [{ machine_model_id: 1, machine_model_version_id: 1, serial_number: 'lt-c' }],
  });
  ok('create WO-C', r, 201);
  const woId = r.data.id;
  const groupId = r.data.groups[0].id;

  // items per target band
  const items = [
    { title: 'set point alarm changes', wantTier: 'EXACT' },
    { title: 'fiber glass custom unit', wantTier: 'SIMILARITY' },
    { title: 'air flow direction', wantTier: 'SIMILARITY' },
    { title: 'Mergepoint', wantTier: 'OTHER' }, // control, no KB/rule match
  ];
  const itemIds = [];
  for (const it of items) {
    r = await api('POST', `/api/work-orders/${woId}/items`, pm, { work_order_group_id: groupId, title: it.title, quantity: 1 });
    ok('add item "' + it.title + '"', r, 201);
    itemIds.push(r.data.id);
  }
  check('all 4 items added', itemIds.length === 4, 'n=' + itemIds.length);

  // analyze
  r = await api('POST', `/api/work-orders/${woId}/analyze`, pm);
  ok('analyze WO-C', r, 200);
  const anSt = (await q('SELECT status FROM work_orders WHERE id=$1', [woId])).rows[0].status;
  check('status ANALYZED', anSt === 'ANALYZED', 'status=' + anSt);

  // classification + match rows from DB
  const clsRows = (await q(
    `SELECT woi.title, c.classification_method, c.status, c.fw_related, c.confidence_score,
            cm.match_type, cm.kb_item_id, cm.rule_id, cm.match_score
     FROM work_order_items woi
     JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN classification_matches cm ON cm.classification_id = c.id
     WHERE woi.work_order_id = $1 ORDER BY woi.item_number`, [woId])).rows;
  console.log('  rows:', clsRows.map((x) => `${x.title}: method=${x.classification_method} status=${x.status} match=${x.match_type} kb=${x.kb_item_id} score=${x.match_score}`).join('\n          '));

  // load KB for independent Jaccard recomputation
  const kb = (await q('SELECT id, kb_code, title, description, keywords FROM kb_items WHERE is_active=TRUE')).rows;

  for (const c of clsRows) {
    // independent Jaccard band
    const it = tk(c.title);
    let best = null, bs = 0;
    for (const k of kb) {
      const kt = tk(k.title + ' ' + (k.description || '') + ' ' + (k.keywords || ''));
      const s = jac(it, kt);
      if (s > bs) { bs = s; best = k; }
    }
    const calcBand = band(bs);
    // API-returned match_type -> tier
    const apiMatch = c.match_type;
    check(`[${c.title}] API tier (${apiMatch||'NONE'}) == calculated Jaccard band (${calcBand})`,
      (apiMatch || 'NONE') === (calcBand === 'SIMILARITY' ? 'SIMILARITY' : calcBand === 'EXACT' ? 'EXACT' : 'NONE'),
      `api=${apiMatch} calc=${calcBand} jaccard=${bs.toFixed(3)}`);
    // classification_method matches tier
    const wantMethod = calcBand === 'SIMILARITY' ? 'SIMILARITY' : calcBand === 'EXACT' ? 'EXACT_MATCH' : 'MANUAL';
    check(`[${c.title}] classification_method == ${wantMethod}`, c.classification_method === wantMethod,
      `got=${c.classification_method}`);
    // status expectation
    const wantStatus = calcBand === 'EXACT' ? 'CLASSIFIED' : 'CODER_REVIEW';
    check(`[${c.title}] status == ${wantStatus}`, c.status === wantStatus, `got=${c.status}`);
    // match row exists iff KB tier
    if (calcBand !== 'OTHER') {
      check(`[${c.title}] match row present + kb_item_id=${best.id}`, c.kb_item_id === best.id,
        `rowKb=${c.kb_item_id} calcBest=${best.id}`);
      // match_score within a tolerance of computed jaccard
      const tol = Math.abs((c.match_score || 0) - bs);
      check(`[${c.title}] match_score ~ jaccard (${bs.toFixed(3)})`, tol < 0.05, `stored=${c.match_score} calc=${bs.toFixed(3)}`);
      // EXACT is firmware CLASSIFIED with estimation; SIMILARITY is not yet estimated
      if (calcBand === 'SIMILARITY') {
        const ii = (await q('SELECT id FROM work_order_items WHERE work_order_id=$1 AND title=$2', [woId, c.title])).rows[0].id;
        const est2 = (await q(`SELECT COUNT(*)::int c FROM item_estimations WHERE work_order_item_id=$1`, [ii])).rows[0].c;
        check(`[${c.title}] no estimation while CODER_REVIEW (similarity)`, est2 === 0, 'est=' + est2);
      }
    } else {
      check(`[${c.title}] no match row (control)`, !c.match_type && !c.kb_item_id, `match=${c.match_type} kb=${c.kb_item_id}`);
    }
  }

  // Explicit expectation on the known SIMILARITY item
  const fiber = clsRows.find((x) => x.title === 'fiber glass custom unit');
  check('fiber glass custom unit -> SIMILARITY + CODER_REVIEW', fiber && fiber.classification_method === 'SIMILARITY' && fiber.status === 'CODER_REVIEW', JSON.stringify(fiber));
  const alarm = clsRows.find((x) => x.title === 'set point alarm changes');
  check('set point alarm changes -> EXACT + CLASSIFIED', alarm && alarm.classification_method === 'EXACT_MATCH' && alarm.status === 'CLASSIFIED', JSON.stringify(alarm));

  // CODER_REVIEW notification fired (similarity items -> coder review) to admins+coders
  const cNotif = (await q(`SELECT DISTINCT user_id FROM notifications WHERE entity_id=$1 AND status='CODER_REVIEW'`, [woId])).rows.map((x) => x.user_id);
  check('CODER_REVIEW notification -> coder(2)+admin(3)', cNotif.includes(2) && cNotif.includes(3), 'users=[' + cNotif.join(',') + ']');

  // coder reviews the SIMILARITY items (L2)
  const simItems = (await q(`SELECT woi.id FROM work_order_items woi JOIN classifications c ON c.work_order_item_id=woi.id WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW' ORDER BY woi.id`, [woId])).rows.map((x) => x.id);
  for (const id of simItems) {
    r = await api('POST', `/api/work-orders/items/${id}/review`, coder, { complexity_level_id: 3, notes: 'similarity smoke review' });
    ok('coder review item ' + id, r, 200);
  }
  const afterReview = (await q(`SELECT COUNT(*)::int c FROM classifications c JOIN work_order_items woi ON woi.id=c.work_order_item_id WHERE woi.work_order_id=$1 AND c.status='CODER_REVIEW'`, [woId])).rows[0].c;
  check('no CODER_REVIEW items after review', afterReview === 0, 'c=' + afterReview);

  // re-analyze to ensure all resolved, then finalize
  r = await api('POST', `/api/work-orders/${woId}/analyze`, pm);
  ok('re-analyze WO-C', r, 200);

  r = await api('POST', `/api/work-orders/${woId}/finalize`, pm);
  ok('finalize WO-C', r, 200);
  const tasks = (r.data && r.data.production_tasks) || [];
  check('production tasks generated', tasks.length >= 1, 'tasks=' + tasks.length);

  r = await api('POST', `/api/work-orders/${woId}/production`, coder);
  ok('startProduction', r, 200);
  for (const t of tasks) {
    r = await api('PUT', `/api/work-orders/${woId}/production/tasks/${t.id}`, coder, { completed: true });
    ok('complete task ' + t.id, r, 200);
  }
  r = await api('POST', `/api/work-orders/${woId}/production/complete`, coder);
  ok('completeProduction', r, 200);
  const st = (await q('SELECT status FROM work_orders WHERE id=$1', [woId])).rows[0].status;
  check('WO-C COMPLETED', st === 'COMPLETED', 'status=' + st);

  console.log('\nWO-C id=' + woId + ' number=' + woNumber + ' final=' + st);
  console.log('=== ' + pass + ' PASS / ' + fail + ' FAIL ===');
  if (fails.length) { console.log('FAILED:'); fails.forEach((l) => console.log('  - ' + l)); }
  require('fs').writeFileSync('C:/Program Files/Firmware Custom/tempLiveTest/_similarity-results.json', JSON.stringify({ woId, woNumber, pass, fail }, null, 2));
  pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('UNCAUGHT', e); process.exit(2); });
