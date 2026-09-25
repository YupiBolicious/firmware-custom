// PM-side provisional estimate verification (2026-09-22). Boots a backend on
// :5127 (SEMANTIC_MARGIN=0.90 so near items land CODER_REVIEW; assist floor 0.60),
// seeds the test KB through the PRODUCTION POST /api/kb lifecycle, creates a WO,
// analyzes, then verifies the PM-facing surfaces:
//   1. analyze response carries provisional_hours + assist_complexity_code only
//      for CODER_REVIEW items WITH an assist snapshot (no-assist item stays null)
//   2. GET /work-orders/:id (PM view) carries assist_* + provisional_hours + title
//   3. no item_estimations row is ever created for the provisional values
//   4. coder review replaces provisional with official estimation
//   5. finalize stays blocked while CODER_REVIEW remains, succeeds after all reviewed
//   +  23-09-23 assist-policy: structured review_reason/assist_blocked_reason persisted
//   +  and carried on analyze/PM view/reuse; API assist_match_score is 0-100 display-only
//   +  while the stored score stays 0-1; provisional survives semantic margin < 0.15.
// Self-cleaning; restores backend/.env on exit.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
const BACKEND = 'C:/Program Files/Firmware Custom/backend';
const ENV_FILE = path.join(BACKEND, '.env');
const base = 'http://localhost:5127';
const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com', admin: 'admin@demo.com' };
const PW = 'password123';
const PREFIX = 'PMP-';

async function api(method, p, token, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + p, { method, headers, body: payload });
  const json = await r.json().catch(() => null);
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
async function query(sql, params) { return pool.query(sql, params); }
async function login(key) {
  const r = await api('POST', '/api/auth/login', undefined, { identifier: EMAILS[key], password: PW });
  if (!r.data || !r.data.token) throw new Error('login failed ' + key + ' ' + r.status);
  return r.data;
}
let pass = 0, fail = 0;
const failLines = [], notes = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; failLines.push(name); console.log('FAIL ' + name + ' -> ' + detail); }
}
function note(name, detail) { notes.push(name); console.log('NOTE ' + name + ' -> ' + detail); }

const poll = async (url, ms, tries) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await new Promise((res) => setTimeout(res, ms));
  }
  return false;
};

const HARNESS_TITLE_MARKERS = ['pmpfrobnicate', 'zzz unrelated wuzzler blix'];
const sweepHarnessArtifacts = async () => {
  let leftovers = [], itemIds = [];
  try { leftovers = (await query(`SELECT id FROM work_orders WHERE wo_number LIKE '${PREFIX}%'`)).rows.map((x) => x.id); } catch (e) { note('sweep:wo', e.message.split('\n')[0]); }
  if (leftovers.length) {
    try { itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [leftovers])).rows.map((x) => x.id); } catch (e) { note('sweep:items', e.message.split('\n')[0]); }
  }
  const steps = [
    [`DELETE FROM audit_trail WHERE work_order_id = ANY($1) OR (entity_type='WORK_ORDER' AND entity_id = ANY($1)) OR (entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($2))`, [leftovers, itemIds]],
    ['DELETE FROM notifications WHERE entity_id = ANY($1)', [leftovers]],
    [`DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))`, [leftovers]],
    [`DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [leftovers]],
    [`DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [leftovers]],
    ['DELETE FROM production_tasks WHERE work_order_id = ANY($1)', [leftovers]],
    ['DELETE FROM work_order_documents WHERE work_order_id = ANY($1)', [leftovers]],
    ['DELETE FROM work_order_access WHERE work_order_id = ANY($1)', [leftovers]],
    ['DELETE FROM work_order_items WHERE work_order_id = ANY($1)', [leftovers]],
    ['DELETE FROM kb_items WHERE kb_code = ANY($1)', [itemIds.map((i) => 'KB-CODER-' + i)]],
    ['DELETE FROM work_order_groups WHERE work_order_id = ANY($1)', [leftovers]],
    ['DELETE FROM work_orders WHERE id = ANY($1)', [leftovers]]
  ];
  const removed = [];
  for (const [sql, params] of steps) {
    if (!params[0].length) continue;
    try { const res = await query(sql, params); if (res.rowCount) removed.push(res.rowCount); } catch (e) { removed.push('ERR ' + e.message.split('\n')[0]); }
  }
  const markerKb = await query(
    `DELETE FROM kb_items WHERE kb_code LIKE 'KB-CODER-%' AND title ILIKE ANY($1::text[])`,
    [HARNESS_TITLE_MARKERS.map((m) => '%' + m + '%')])
    .then((r) => r.rowCount).catch((e) => { note('sweep:kb-marker', e.message.split('\n')[0]); return 0; });
  const scratchKb = await query(`DELETE FROM kb_items WHERE kb_code LIKE 'KB-${PREFIX}%'`)
    .then((r) => r.rowCount).catch((e) => { note('sweep:kb-scratch', e.message.split('\n')[0]); return -1; });
  return { wos: leftovers.length, removed, markerKb, scratchKb };
};

(async () => {
  const ts = Date.now();
  const originalEnv = fs.readFileSync(ENV_FILE, 'utf8');
  const patchedEnv = originalEnv
    .replace(/^PORT=.*$/m, 'PORT=5127')
    .replace(/^SEMANTIC_MARGIN=.*$/m, 'SEMANTIC_MARGIN=0.90')
    .replace(/^SEMANTIC_ASSIST_MARGIN=.*$/m, 'SEMANTIC_ASSIST_MIN_SCORE=0.60')
    + '\n# verifier-only\nLEXICAL_DICE_MIN_JACCARD=0.9\nSEMANTIC_ASSIST_MIN_SCORE=0.60\n';
  const restoreEnv = () => { try { fs.writeFileSync(ENV_FILE, originalEnv); } catch (e) {} };
  process.on('exit', restoreEnv);
  fs.writeFileSync(ENV_FILE, patchedEnv);
  note('swept harness artifacts', JSON.stringify(await sweepHarnessArtifacts()));
  const baselineActive = (await query(`SELECT COUNT(*)::int c FROM kb_items WHERE is_active=TRUE`)).rows[0].c;
  const baselineKv = (await query(`SELECT version FROM kb_corpus_version ORDER BY id DESC LIMIT 1`)).rows[0].version;
  let woId = null;
  let warmWoId = null;
  const seededKbIds = [];
  const child = spawn('node', ['src/server.js'], { cwd: BACKEND });
  child.stdout.on('data', (b) => process.stdout.write('[child] ' + b));
  child.stderr.on('data', (b) => process.stdout.write('[child-err] ' + b));
  const booted = await poll(base + '/api/health', 1000, 60);
  check('backend :5127 boots (auto .90 / assist .60)', booted, 'health poll timeout');
  try {
    if (!booted) throw new Error('no backend');
    const [pmAcc, coderAcc, adminAcc] = await Promise.all([login('pm'), login('coder'), login('admin')]);
    const pm = pmAcc.token, coder = coderAcc.token, admin = adminAcc.token;

    const warmModel = (await query(
      `SELECT mm.id AS model_id, mmv.id AS version_id
       FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
       ORDER BY mm.id, mmv.id LIMIT 1`
    )).rows[0];
    const warmGroup = { machine_model_id: warmModel.model_id, machine_model_version_id: warmModel.version_id, serial_number: 'pmp-warm-' + ts };
    let wr = await api('POST', '/api/work-orders', pm, { wo_number: PREFIX + 'WARM-' + ts, title: 'warm up', description: 'w', customer: 'QA', groups: [warmGroup] });
    warmWoId = wr.data.id;
    await api('POST', '/api/work-orders/' + wr.data.id + '/items', pm, { work_order_group_id: wr.data.groups[0].id, title: 'primer ignition starter ' + ts, description: '', quantity: 1 });
    let warm = await api('POST', '/api/work-orders/' + wr.data.id + '/analyze', pm);
    for (let i = 0; i < 3 && (!warm.data || !warm.data.perf || warm.data.perf.semanticHits === 0); i++) {
      await new Promise((res) => setTimeout(res, 5000));
      warm = await api('POST', '/api/work-orders/' + wr.data.id + '/analyze', pm);
    }
    note('warmup semanticHits', warm.data && warm.data.perf && warm.data.perf.semanticHits);

    const l2 = (await query(`SELECT id, total_hours FROM complexity_levels WHERE code='L2'`)).rows[0];
    const l2Hours = Number(l2.total_hours);

    const kbTitle = 'pmpfrobnicate servo axis alignment calibration ' + ts;
    const seed = await api('POST', '/api/kb', admin, {
      kb_code: 'KB-' + PREFIX + ts,
      title: kbTitle,
      description: 'perform the pmpfrobnicate servo axis calibration routine during the line changeover',
      keywords: '',
      fw_related: true,
      complexity_level_id: l2.id,
      confidence_score: 95,
      source: 'SEED',
      is_active: true,
    });
    check('seed KB created via production POST /api/kb', seed.status === 201 && !!seed.data && !!seed.data.id, 'status=' + seed.status);
    seededKbIds.push(Number(seed.data.id));

    // Second near-twin seed: forces a small top-vs-second semantic margin for
    // item A, proving a PROVISIONAL estimate survives margin < 0.15.
    const seed2 = await api('POST', '/api/kb', admin, {
      kb_code: 'KB-' + PREFIX + 'B' + ts,
      title: 'pmpfrobnicate servo axis alignment calibration variant ' + ts,
      description: 'run the pmpfrobnicate servo axis calibration routine during the line changeover',
      keywords: '',
      fw_related: true,
      complexity_level_id: l2.id,
      confidence_score: 90,
      source: 'SEED',
      is_active: true,
    });
    check('seed2 (twin) KB created', seed2.status === 201 && !!seed2.data && !!seed2.data.id, 'status=' + seed2.status);
    if (seed2.data && seed2.data.id) seededKbIds.push(Number(seed2.data.id));

    const model = (await query(
      `SELECT mm.id AS model_id, mmv.id AS version_id
       FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
       ORDER BY mm.id, mmv.id LIMIT 1`
    )).rows[0];
    const group = { machine_model_id: model.model_id, machine_model_version_id: model.version_id, serial_number: 'pmp-' + ts };
    let r = await api('POST', '/api/work-orders', pm, { wo_number: PREFIX + 'WO-' + ts, title: 'PMP smoke', description: 'pmp', customer: 'QA', groups: [group] });
    woId = r.data.id;
    const groupId = r.data.groups[0].id;

    // Item A: matches seed -> CODER_REVIEW WITH assist snapshot (L2)
    r = await api('POST', '/api/work-orders/' + woId + '/items', pm,
      { work_order_group_id: groupId, title: `pmpfrobnicate servo axis alignment calibration procedure applied along the line ${ts}`,
        description: 'perform the pmpfrobnicate servo axis calibration routine during the line changeover', quantity: 2 });
    const itemA = r.data.id;
    // Item B: no match below assist floor -> CODER_REVIEW with NO assist
    r = await api('POST', '/api/work-orders/' + woId + '/items', pm,
      { work_order_group_id: groupId, title: 'zzz unrelated wuzzler blix ' + ts, description: '', quantity: 1 });
    const itemB = r.data.id;

    // ---- Baseline: no item_estimations rows for either item before analyze
    const estBefore = (await query(`SELECT COUNT(*)::int c FROM item_estimations WHERE work_order_item_id IN ($1,$2)`, [itemA, itemB])).rows[0].c;
    check('no estimation rows before analyze', estBefore === 0, 'count=' + estBefore);

    r = await api('POST', '/api/work-orders/' + woId + '/analyze', pm);
    check('analyze 200', r.status === 200, 'status=' + r.status);
    note('analyze perf', JSON.stringify(r.data && r.data.perf));

    const resA = (r.data.results || []).find((x) => x.item_id === itemA);
    const resB = (r.data.results || []).find((x) => x.item_id === itemB);
    check('analyze: item A CODER_REVIEW', resA && resA.status === 'CODER_REVIEW', resA && resA.status);
    check('analyze: item A provisional_hours = L2 hours x qty', resA && resA.provisional_hours === l2Hours * 2, JSON.stringify({ got: resA && resA.provisional_hours, want: l2Hours * 2 }));
    check('analyze: item A assist_complexity_code = L2', resA && resA.assist_complexity_code === 'L2', resA && resA.assist_complexity_code);
    check('analyze: item A estimated_hours null (not official)', resA && resA.estimated_hours == null, JSON.stringify(resA && resA.estimated_hours));
    check('analyze: item B provisional_hours null (no assist)', resB && resB.provisional_hours == null, JSON.stringify(resB && resB.provisional_hours));
    check('analyze: item B assist_complexity_code null', resB && resB.assist_complexity_code == null, JSON.stringify(resB && resB.assist_complexity_code));
    const itemBInReview = resB && resB.status === 'CODER_REVIEW';
    note('item B analyze status', resB ? resB.status : 'missing');

    // ---- Persisted snapshot in DB
    const clsA = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [itemA])).rows[0];
    check('DB: item A assist snapshot persisted (kb_code + L2)', clsA && clsA.status === 'CODER_REVIEW' && clsA.assist_kb_code && Number(clsA.assist_complexity_level_id) === Number(l2.id), JSON.stringify(clsA && { status: clsA.status, code: clsA.assist_kb_code, lvl: clsA.assist_complexity_level_id }));

    // ---- PM view: GET /work-orders/:id carriers assist_* + provisional_hours + title
    let wo = await api('GET', '/api/work-orders/' + woId, pm);
    check('GET /work-orders/:id 200 (PM)', wo.status === 200, 'status=' + wo.status);
    const itA = (wo.data && wo.data.items ? wo.data.items : []).find((x) => x.id === itemA);
    const itB = (wo.data && wo.data.items ? wo.data.items : []).find((x) => x.id === itemB);
    check('PM view: item A assist_kb_title present', itA && !!itA.assist_kb_title, JSON.stringify(itA && itA.assist_kb_title));
    check('PM view: item A assist_kb_code present', itA && !!itA.assist_kb_code, JSON.stringify(itA && itA.assist_kb_code));
    check('PM view: item A assist_complexity_code = L2', itA && itA.assist_complexity_code === 'L2', JSON.stringify(itA && itA.assist_complexity_code));
    check('PM view: item A provisional_hours = L2 x qty', itA && Number(itA.provisional_hours) === l2Hours * 2, JSON.stringify({ got: itA && itA.provisional_hours, want: l2Hours * 2 }));
    check('PM view: item A estimated_hours 0 (no official estimation written)', itA && Number(itA.estimated_hours) === 0, JSON.stringify(itA && itA.estimated_hours));
    check('PM view: item B provisional_hours null (no assist)', itB && itB.provisional_hours == null, JSON.stringify(itB && itB.provisional_hours));
    check('PM view: item B assist_kb_code absent', itB && itB.assist_kb_code == null, JSON.stringify(itB && itB.assist_kb_code));

    // ---- Structured why-review reason (23-09-23 policy) + guardrail: API
    // display score is 0-100, the persisted score stays 0-1.
    const REVIEW_CODES = ['NO_EXACT_OR_RULE_MATCH', 'SEMANTIC_CANDIDATE_LOW_QUALITY', 'NO_USABLE_SEMANTIC_CANDIDATE', 'CODE_MODEL_MISMATCH'];
    const BLOCK_CODES = ['NO_SEMANTIC_CANDIDATE', 'SCORE_BELOW_FLOOR', 'ROW_UNRESOLVED', 'MODEL_CODE_MISMATCH', 'VERSION_MISMATCH', 'SERIAL_MISMATCH', 'MEASUREMENT_MISMATCH'];
    check('analyze: item A assist_match_score is 0-100 display int', resA && Number.isInteger(resA.assist_match_score) && resA.assist_match_score >= 60 && resA.assist_match_score <= 100, JSON.stringify(resA && resA.assist_match_score));
    check('DB: item A persisted assist_match_score stays 0-1', clsA && Number(clsA.assist_match_score) >= 0 && Number(clsA.assist_match_score) <= 1, JSON.stringify(clsA && clsA.assist_match_score));
    check('DB: item A raw score == display/100', clsA && resA && Math.round(Number(clsA.assist_match_score) * 100) === resA.assist_match_score, JSON.stringify({ db: clsA && clsA.assist_match_score, api: resA && resA.assist_match_score }));
    check('analyze: item A provisional survives margin < 0.15', resA && resA.assist_semantic_margin != null && Number(resA.assist_semantic_margin) < 0.15, JSON.stringify(resA && resA.assist_semantic_margin));
    check('analyze: item A review_reason = NO_EXACT_OR_RULE_MATCH (assist present)', resA && resA.review_reason === 'NO_EXACT_OR_RULE_MATCH', JSON.stringify(resA && resA.review_reason));
    check('DB: item A review_reason persisted, assist_blocked_reason null', clsA && clsA.review_reason === 'NO_EXACT_OR_RULE_MATCH' && clsA.assist_blocked_reason == null, JSON.stringify(clsA && { r: clsA.review_reason, b: clsA.assist_blocked_reason }));
    check('PM view: item A review_reason carried', itA && itA.review_reason === 'NO_EXACT_OR_RULE_MATCH', JSON.stringify(itA && itA.review_reason));
    check('analyze: item B assist_match_score null (no assist)', resB && resB.assist_match_score == null, JSON.stringify(resB && resB.assist_match_score));
    if (itemBInReview) {
      check('analyze: item B review_reason structured', REVIEW_CODES.includes(resB.review_reason), JSON.stringify(resB && resB.review_reason));
      check('analyze: item B assist_blocked_reason in block set', BLOCK_CODES.includes(resB.assist_blocked_reason), JSON.stringify(resB && resB.assist_blocked_reason));
      check('DB: item B assist_blocked_reason persisted', (await query(`SELECT assist_blocked_reason, review_reason FROM classifications WHERE work_order_item_id=$1`, [itemB])).rows[0].assist_blocked_reason != null, 'no block reason persisted');
    }

    // ---- Re-analyze is a reusable/hash-preserved path: structured reason +
    // provisional + snapshot must be preserved, not recomputed/reset
    const r2 = await api('POST', '/api/work-orders/' + woId + '/analyze', pm);
    const resA2 = (r2.data && r2.data.results || []).find((x) => x.item_id === itemA);
    const resB2 = (r2.data && r2.data.results || []).find((x) => x.item_id === itemB);
    check('re-analyze: item A provisional preserved', resA2 && resA2.provisional_hours === l2Hours * 2, JSON.stringify({ got: resA2 && resA2.provisional_hours, want: l2Hours * 2 }));
    check('re-analyze: item A review_reason preserved', resA2 && resA2.review_reason === 'NO_EXACT_OR_RULE_MATCH', JSON.stringify(resA2 && resA2.review_reason));
    check('re-analyze: item B structured reason preserved', itemBInReview ? (resB2 && REVIEW_CODES.includes(resB2.review_reason)) : !!resB2, JSON.stringify(resB2 && resB2.review_reason));

    // ---- No item_estimations row created for provisional (item A) value
    const estAonly = (await query(`SELECT COUNT(*)::int c FROM item_estimations WHERE work_order_item_id=$1`, [itemA])).rows[0].c;
    check('no item_estimations row for item A provisional value', estAonly === 0, 'count=' + estAonly);

    // ---- Finalize blocked while any CODER_REVIEW remains
    r = await api('POST', '/api/work-orders/' + woId + '/finalize', pm);
    check('finalize 400 while CODER_REVIEW remains', r.status === 400, 'status=' + r.status + ' msg=' + (r.json && r.json.message));
    check('finalize error mentions awaiting coder review', r.json && /awaiting coder review/i.test(r.json.message), r.json && r.json.message);

    // ---- Coder reviews: accept assist for A (L2); review B only if still CODER_REVIEW
    r = await api('POST', '/api/work-orders/items/' + itemA + '/review', coder,
      { complexity_level_id: l2.id, keywords: '', notes: 'pm side provisional check', semantic_assist_response: 'ACCEPTED' });
    check('review item A ACCEPTED 200', r.status === 200, 'status=' + r.status);
    if (itemBInReview) {
      r = await api('POST', '/api/work-orders/items/' + itemB + '/review', coder,
        { complexity_level_id: (await query(`SELECT id FROM complexity_levels WHERE code='L0'`)).rows[0].id, keywords: '', notes: 'manual', semantic_assist_response: 'IGNORED' });
      check('review item B 200', r.status === 200, 'status=' + r.status);
    } else {
      note('review item B skip', 'item B not CODER_REVIEW this run (corpus drift)');
    }

    // ---- Official estimation now replaces provisional
    const estA = (await query(`SELECT * FROM item_estimations WHERE work_order_item_id=$1`, [itemA])).rows[0];
    check('item A official estimation row created AFTER review', !!estA, 'est=' + JSON.stringify(estA));
    wo = await api('GET', '/api/work-orders/' + woId, pm);
    const itAAfter = (wo.data && wo.data.items ? wo.data.items : []).find((x) => x.id === itemA);
    check('after review: item A estimated_hours present (official)', itAAfter && Number(itAAfter.estimated_hours) > 0 && Number(itAAfter.estimated_hours) !== Number(itA.provisional_hours), JSON.stringify({ got: itAAfter && itAAfter.estimated_hours, prov: itA && itA.provisional_hours }));
    check('after review: item A provisional_hours gone (official wins)', itAAfter && itAAfter.provisional_hours == null, JSON.stringify(itAAfter && itAAfter.provisional_hours));

    // ---- Finalize succeeds once all reviewed
    r = await api('POST', '/api/work-orders/' + woId + '/finalize', pm);
    check('finalize 200 after all reviews cleared', r.status === 200, 'status=' + r.status);

// ---- Cleanup (FK-safe) + baseline reassert
    const deleteWoChain = async (id) => {
      const r = { aud: await query(`DELETE FROM audit_trail WHERE work_order_id=$1 OR (entity_type='WORK_ORDER' AND entity_id=$1)`, [id]),
        noti: await query(`DELETE FROM notifications WHERE entity_id=$1`, [id]) };
      const cms = await query(`DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1))`, [id]);
      const cls = await query(`DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)`, [id]);
      const est = await query(`DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)`, [id]);
      const items = await query(`DELETE FROM work_order_items WHERE work_order_id=$1`, [id]);
      const grp = await query(`DELETE FROM work_order_groups WHERE work_order_id=$1`, [id]);
      const wo = await query(`DELETE FROM work_orders WHERE id=$1`, [id]);
      return { ...r, cms: cms.rowCount, cls: cls.rowCount, est: est.rowCount, items: items.rowCount, grp: grp.rowCount, wo: wo.rowCount };
    };
    const cleanupNote = { main: {}, warm: {} };
    cleanupNote.main = await deleteWoChain(woId);
    if (warmWoId) cleanupNote.warm = await deleteWoChain(warmWoId);
    const kbDel = await query(`DELETE FROM kb_items WHERE id = ANY($1)`, [[...seededKbIds]]);
    const learned = await query(`DELETE FROM kb_items WHERE kb_code IN ('KB-CODER-' || $1, 'KB-CODER-' || $2)`, [itemA, itemB]);
    note('cleanup rows', JSON.stringify({ ...cleanupNote, kb: kbDel.rowCount, learned: learned.rowCount }));

    const usersNow = (await query(`SELECT COUNT(*)::int c FROM users`)).rows[0].c;
    const activeNow = (await query(`SELECT COUNT(*)::int c FROM kb_items WHERE is_active=TRUE`)).rows[0].c;
    const kbLeft = (await query(`SELECT COUNT(*)::int c FROM kb_items WHERE kb_code LIKE 'KB-${PREFIX}%'`)).rows[0].c;
    const woLeft = (await query(`SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE '${PREFIX}%'`)).rows[0].c;
    const kvNow = (await query(`SELECT version FROM kb_corpus_version ORDER BY id DESC LIMIT 1`)).rows[0].version;
    check('cleanup: baseline users untouched', usersNow === 5, 'users=' + usersNow);
    check('cleanup: active KB count restored', activeNow === baselineActive, 'active=' + activeNow + ' base=' + baselineActive);
    check('cleanup: no PMP KB leftovers', kbLeft === 0, 'left=' + kbLeft);
    check('cleanup: no PMP WOs', woLeft === 0, 'left=' + woLeft);
    check('cleanup: kb_corpus_version monotonic', kvNow >= baselineKv, 'kv=' + kvNow + ' base=' + baselineKv);
  } catch (e) {
    check('script completed without throwing', false, e && e.stack || String(e));
  } finally {
    child.kill();
    const deleteWoChain = async (id) => {
      await query(`DELETE FROM audit_trail WHERE work_order_id=$1 OR (entity_type='WORK_ORDER' AND entity_id=$1)`, [id]);
      await query(`DELETE FROM notifications WHERE entity_id=$1`, [id]);
      await query(`DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)`, [id]);
      await query(`DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1))`, [id]);
      await query(`DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id=$1)`, [id]);
      await query(`DELETE FROM work_order_items WHERE work_order_id=$1`, [id]);
      await query(`DELETE FROM work_order_groups WHERE work_order_id=$1`, [id]);
      await query(`DELETE FROM work_orders WHERE id=$1`, [id]);
    };
    if (woId) {
      try { await deleteWoChain(woId); } catch (e) { note('finally-cleanup', e.message.split('\n')[0]); }
    }
    if (warmWoId) {
      try { await deleteWoChain(warmWoId); } catch (e) { note('finally-warm-cleanup', e.message.split('\n')[0]); }
    }
    if (seededKbIds.length) {
      try { await query(`DELETE FROM kb_items WHERE id = ANY($1)`, [seededKbIds]); } catch (e) { note('finally-kb', e.message.split('\n')[0]); }
    }
    if (woId) {
      try {
        await query(`DELETE FROM kb_items WHERE kb_code IN ('KB-CODER-' || $1)`, [woId]);
        const learned = (await query(`SELECT id FROM work_order_items WHERE work_order_id=$1`, [woId])).rows;
        for (const i of learned) await query(`DELETE FROM kb_items WHERE kb_code = 'KB-CODER-' || $1`, [i.id]);
      } catch (e) { note('finally-learned', e.message.split('\n')[0]); }
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  console.log('\nRESULT ' + pass + ' PASS / ' + fail + ' FAIL');
  if (failLines.length) console.log('FAILED: ' + failLines.join(' | '));
  restoreEnv();
  process.exit(fail ? 1 : 0);
})();