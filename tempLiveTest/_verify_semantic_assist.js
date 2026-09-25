// Semantic-assist suggestion for coder review (2026-09-21). Boots its own
// backend on :5127 with SEMANTIC_MARGIN=0.90 (auto-claim only near-identical)
// and SEMANTIC_ASSIST_MIN_SCORE=0.60. Seeds the test KB through the PRODUCTION
// POST /api/kb lifecycle (is_active=true, kb_corpus_version auto-bumped) — no
// raw SQL, no manual version bump. Assist gate is absolute score + code
// agreement + KB resolution; margin never blocks assist (auto-claim only).
// Self-cleaning, restores backend/.env on exit.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
const BACKEND = 'C:/Program Files/Firmware Custom/backend';
const ENV_FILE = path.join(BACKEND, '.env');
const base = 'http://localhost:5127';
const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com', admin: 'admin@demo.com' };
const PW = 'password123';
const PREFIX = 'SA-';

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

// Stale coder-learned KB rows whose source item vanished (scratched away in an
// earlier/aborted run) pollute the corpus and collapse the semantic gap. Sweep
// every harness artifact by marker at START so runs are idempotent/self-healing.
const HARNESS_TITLE_MARKERS = ['zolli', 'qipfrobnit', 'frobnicate'];
const sweepHarnessArtifacts = async () => {
  const steps = [];
  let leftovers = [];
  let itemIds = [];
  try { leftovers = (await query(`SELECT id FROM work_orders WHERE wo_number LIKE 'SA-%'`)).rows.map((x) => x.id); } catch (e) { note('sweep:wo', e.message.split('\n')[0]); }
  if (leftovers.length) {
    try { itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [leftovers])).rows.map((x) => x.id); } catch (e) { note('sweep:items', e.message.split('\n')[0]); }
  }
  steps.push(
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
  );
  const removed = [];
  for (const [sql, params] of steps) {
    if (!params[0].length) continue;
    try { const res = await query(sql, params); if (res.rowCount) removed.push(res.rowCount); } catch (e) { removed.push('ERR ' + e.message.split('\n')[0]); }
  }
  const markerKb = await query(
    `DELETE FROM kb_items WHERE kb_code LIKE 'KB-CODER-%' AND title ILIKE ANY($1::text[])`,
    [HARNESS_TITLE_MARKERS.map((m) => '%' + m + '%')])
    .then((r) => r.rowCount).catch((e) => { note('sweep:kb-marker', e.message.split('\n')[0]); return 0; });
  const scratchKb = await query(`DELETE FROM kb_items WHERE kb_code LIKE 'KB-SA-%' OR kb_code LIKE 'KB-SEED-%'`)
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
    + '\n# verifier-only: only near-identical titles auto-claim; everything else routes to coder review\nLEXICAL_DICE_MIN_JACCARD=0.9\nSEMANTIC_ASSIST_MIN_SCORE=0.60\n';
  const restoreEnv = () => { try { fs.writeFileSync(ENV_FILE, originalEnv); } catch (e) {} };
  process.on('exit', restoreEnv);
  fs.writeFileSync(ENV_FILE, patchedEnv);
  note('swept harness artifacts', JSON.stringify(await sweepHarnessArtifacts()));
  const baselineActive = (await query(`SELECT COUNT(*)::int c FROM kb_items WHERE is_active=TRUE`)).rows[0].c;
  const baselineKv = (await query(`SELECT version FROM kb_corpus_version ORDER BY id DESC LIMIT 1`)).rows[0].version;
  let warmWo = null;
  let woId = null;
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

    // Warm the embedder (model cold-start can exceed SEMANTIC_TIMEOUT_MS and
    // yield semantic=null on first analyze). Prime it on a throwaway WO first.
    const warmModel = (await query(
      `SELECT mm.id AS model_id, mmv.id AS version_id
       FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
       ORDER BY mm.id, mmv.id LIMIT 1`
    )).rows[0];
    const warmGroup = { machine_model_id: warmModel.model_id, machine_model_version_id: warmModel.version_id, serial_number: 'sa-warm-' + ts };
    let wr = await api('POST', '/api/work-orders', pm, { wo_number: PREFIX + 'WARM-' + ts, title: 'warm up', description: 'w', customer: 'QA', groups: [warmGroup] });
    warmWo = wr.data.id;
    await api('POST', '/api/work-orders/' + warmWo + '/items', pm, { work_order_group_id: wr.data.groups[0].id, title: 'primer ignition starter ' + ts, description: '', quantity: 1 });
    let warm = await api('POST', '/api/work-orders/' + warmWo + '/analyze', pm);
    for (let i = 0; i < 3 && (!warm.data || !warm.data.perf || warm.data.perf.semanticHits === 0); i++) {
      await new Promise((res) => setTimeout(res, 5000));
      warm = await api('POST', '/api/work-orders/' + warmWo + '/analyze', pm);
    }
    note('warmup semanticHits', warm.data && warm.data.perf && warm.data.perf.semanticHits);

    const l2 = (await query(`SELECT id FROM complexity_levels WHERE code='L2'`)).rows[0];
    const l0 = (await query(`SELECT id FROM complexity_levels WHERE code='L0'`)).rows[0];
    // Short KB row sharing a unique 'zolli' core token; item title overrides it
    // so lexical stays in the SIMILARITY (review) band while the semantic top
    // match is this row (nothing else in the corpus carries 'zolli'). Seeded
    // through the PRODUCTION POST /api/kb lifecycle: repository defaults
    // is_active=true and bumps kb_corpus_version, so the matrix rebuilds.
    const kbTitle = 'zolli servo axis alignment calibration ' + ts;
    const seedBody = (code) => ({
      kb_code: code,
      title: kbTitle,
      description: 'perform the zolli servo axis calibration routine during the line changeover',
      keywords: '',
      fw_related: true,
      complexity_level_id: l2.id,
      confidence_score: 95,
      source: 'SEED',
      is_active: true,
    });
    const seed = await api('POST', '/api/kb', admin, seedBody('KB-' + PREFIX + ts));
    check('seed KB created via production POST /api/kb', seed.status === 201 && !!seed.data && !!seed.data.id, 'status=' + seed.status);
    check('seed KB created active (is_active true)', seed.data && seed.data.is_active === true, String(seed.data && seed.data.is_active));
    const kbId = seed.data.id;
    seededKbIds.push(Number(kbId));
    // Twin: SECOND near-identical row collapses top-vs-second margin below the
    // auto floor while the absolute top score stays ~0.95 — prove margin blocks
    // auto-claim but NOT assist (score-gated assist must still surface).
    const twin = await api('POST', '/api/kb', admin, seedBody('KB-' + PREFIX + ts + '-T'));
    check('twin seed created via production POST /api/kb', twin.status === 201 && !!twin.data && !!twin.data.id, 'status=' + twin.status);
    seededKbIds.push(Number(twin.data.id));

    const model = (await query(
      `SELECT mm.id AS model_id, mmv.id AS version_id
       FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
       ORDER BY mm.id, mmv.id LIMIT 1`
    )).rows[0];
    const group = { machine_model_id: model.model_id, machine_model_version_id: model.version_id, serial_number: 'sa-' + ts };
    let r = await api('POST', '/api/work-orders', pm, { wo_number: PREFIX + 'WO-' + ts, title: 'SA smoke', description: 'sa', customer: 'QA', groups: [group] });
    woId = r.data.id;
    const groupId = r.data.groups[0].id;

    const nearItems = [];
    for (const suffix of ['alpha', 'beta']) {
      r = await api('POST', '/api/work-orders/' + woId + '/items', pm,
        { work_order_group_id: groupId,
          title: `zolli servo axis alignment calibration procedure applied along the conveyor line ${suffix} ${ts}`,
          description: 'perform the zolli servo axis calibration routine during the line changeover', quantity: 1 });
      nearItems.push(r.data.id);
    }
    const [nearItemId, staleItemId] = nearItems;
    // Low-margin regression: with the twin seed in the corpus the top-vs-second
    // margin collapses (< 0.90 auto floor) while the absolute top score stays
    // ~0.95. Auto-claim must be blocked by the margin floor; assist must STILL
    // surface for coder review because its gate is the absolute score.
    r = await api('POST', '/api/work-orders/' + woId + '/items', pm,
      { work_order_group_id: groupId,
        title: `zolli servo axis alignment calibration procedure applied along the conveyor line twin ${ts}`,
        description: 'perform the zolli servo axis calibration routine during the line changeover', quantity: 1 });
    const twinItemId = r.data.id;
    // Unrelated item: review path with NO assist (forced-choice free). Its top
    // semantic score (~0.52–0.57 class) must stay below the 0.60 assist floor.
    r = await api('POST', '/api/work-orders/' + woId + '/items', pm, { work_order_group_id: groupId, title: 'qipfrobnit wuzzler blix ' + ts, description: '', quantity: 1 });
    const plainItemId = r.data.id;

    r = await api('POST', '/api/work-orders/' + woId + '/analyze', pm);
    check('analyze 200', r.status === 200, 'status=' + r.status);
    note('analyze perf', JSON.stringify(r.data && r.data.perf));

    const assistKb = (c) => String(c && c.assist_kb_code);
    const harvestSeeds = [Number(kbId), Number(twin.data.id)];
    const nearCls = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [nearItemId])).rows[0];
    check('near item -> CODER_REVIEW', nearCls && nearCls.status === 'CODER_REVIEW', JSON.stringify(nearCls && { status: nearCls.status, assist_kb_code: nearCls.assist_kb_code, assist_kb_id: nearCls.assist_kb_id }));
    check('assist snapshot persisted (kb_code)', assistKb(nearCls).startsWith('KB-' + PREFIX), nearCls && nearCls.assist_kb_code);
    check('assist snapshot persisted (kb_id)', nearCls && harvestSeeds.includes(Number(nearCls.assist_kb_id)), nearCls && nearCls.assist_kb_id);
    check('assist snapshot level = L2', nearCls && Number(nearCls.assist_complexity_level_id) === Number(l2.id), nearCls && nearCls.assist_complexity_level_id);
    check('assist snapshot fw_related true', nearCls && nearCls.assist_fw_related === true, nearCls && String(nearCls.assist_fw_related));
    note('assist score/margin', JSON.stringify({ s: nearCls && nearCls.assist_match_score, m: nearCls && nearCls.assist_semantic_margin }));

    // Low-margin twin regression: margin below the auto floor (0.90 here and
    // 0.15 in prod) blocks auto-claim but must NOT block score-gated assist.
    const twinCls = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [twinItemId])).rows[0];
    check('twin auto-claim blocked (margin below auto floor)', twinCls && twinCls.status === 'CODER_REVIEW', twinCls && twinCls.status);
    check('twin assist SURFACES despite low margin', !!twinCls && assistKb(twinCls).startsWith('KB-' + PREFIX), twinCls && twinCls.assist_kb_code);
    check('twin assist semantic_margin < auto floor', twinCls && Number(twinCls.assist_semantic_margin) < 0.90, String(twinCls && twinCls.assist_semantic_margin));
    check('twin assist absolute score >= 0.60 floor', twinCls && Number(twinCls.assist_match_score) >= 0.60, String(twinCls && twinCls.assist_match_score));
    check('twin assist level = L2', twinCls && Number(twinCls.assist_complexity_level_id) === Number(l2.id), twinCls && twinCls.assist_complexity_level_id);
    note('twin score/margin', JSON.stringify({ s: twinCls && twinCls.assist_match_score, m: twinCls && twinCls.assist_semantic_margin }));

    const decided = (await query(
      `SELECT details FROM audit_trail WHERE entity_type='WORK_ORDER_ITEM' AND entity_id=$1 AND action='CLASSIFY_DECIDED' ORDER BY id DESC LIMIT 1`, [nearItemId]
    )).rows[0];
    check('DECIDED audit carries assist_kb_id', !!decided && harvestSeeds.includes(Number(decided.details.assist_kb_id)), JSON.stringify(decided && decided.details));
    check('DECIDED audit carries assist_kb_code', !!decided && String(decided.details.assist_kb_code).startsWith('KB-' + PREFIX), decided && decided.details.assist_kb_code);

    const plainCls = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [plainItemId])).rows[0];
    check('false candidate (~0.57 class) has no assist', !!plainCls && !plainCls.assist_kb_code, JSON.stringify(plainCls && { code: plainCls.assist_kb_code, margin: plainCls.assist_semantic_margin }));
    const plainDecided = (await query(
      `SELECT details FROM audit_trail WHERE entity_type='WORK_ORDER_ITEM' AND entity_id=$1 AND action='CLASSIFY_DECIDED' ORDER BY id DESC LIMIT 1`, [plainItemId]
    )).rows[0];
    check('false candidate top score < 0.60 (SCORE gate blocks)', !!plainDecided && plainDecided.details && Number(plainDecided.details.semantic_top_score) < 0.60, JSON.stringify(plainDecided && plainDecided.details.semantic_top_score));
    note('unrelated item status', plainCls ? plainCls.status : 'none');

    r = await api('GET', '/api/work-orders/review-queue', coder);
    const queueItem = r.data && r.data.items.find((x) => Number(x.item_id) === Number(nearItemId));
    check('review queue exposes assist fields', !!queueItem && assistKb(queueItem).startsWith('KB-' + PREFIX), JSON.stringify(queueItem && { code: queueItem.assist_kb_code, level: queueItem.assist_complexity_level_id, fw: queueItem.assist_fw_related }));
    check('queue exposes assist_complexity_level_id (pre-fill)', !!queueItem && Number(queueItem.assist_complexity_level_id) === Number(l2.id), queueItem && queueItem.assist_complexity_level_id);
    check('queue exposes assist_fw_related', !!queueItem && queueItem.assist_fw_related === true, queueItem && String(queueItem.assist_fw_related));
    check('queue exposes assist_kb_title (context join)', !!queueItem && typeof queueItem.assist_kb_title === 'string' && queueItem.assist_kb_title.length > 0, queueItem && queueItem.assist_kb_title);

    r = await api('POST', '/api/work-orders/items/' + nearItemId + '/review', coder, { complexity_level_id: l2.id, notes: 'ok' });
    check('review without response -> 400 (forced choice)', r.status === 400 && r.json && String(r.json.message).includes('Accept or Ignore'), 'status=' + r.status + ' msg=' + (r.json && r.json.message));

    r = await api('POST', '/api/work-orders/items/' + nearItemId + '/review', coder, { complexity_level_id: l2.id, semantic_assist_response: 'SOMETIMES' });
    check('review invalid response -> 400', r.status === 400, 'status=' + r.status);

    r = await api('POST', '/api/work-orders/items/' + nearItemId + '/review', coder, { complexity_level_id: l2.id, semantic_assist_response: 'ACCEPTED', notes: 'agreed with suggestion' });
    check('review ACCEPTED 200', r.status === 200, 'status=' + r.status);
    const acceptedCls = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [nearItemId])).rows[0];
    check('assist_response persisted = ACCEPTED', acceptedCls && acceptedCls.assist_response === 'ACCEPTED', acceptedCls && acceptedCls.assist_response);
    check('final class status CLASSIFIED', acceptedCls && acceptedCls.status === 'CLASSIFIED', acceptedCls && acceptedCls.status);

    const reviewed = (await query(
      `SELECT details FROM audit_trail WHERE entity_type='WORK_ORDER_ITEM' AND entity_id=$1 AND action='CLASSIFY_REVIEWED' ORDER BY id DESC LIMIT 1`, [nearItemId]
    )).rows[0];
    const d = reviewed && reviewed.details;
    check('REVIEWED audit assist_shown true', !!d && d.assist_shown === true, JSON.stringify(d));
    check('REVIEWED audit assist_response ACCEPTED', !!d && d.assist_response === 'ACCEPTED', d && d.assist_response);
    check('REVIEWED audit assist_kb_id', !!d && harvestSeeds.includes(Number(d.assist_kb_id)), d && d.assist_kb_id);
    check('REVIEWED audit assist_kb_code', !!d && String(d.assist_kb_code).startsWith('KB-' + PREFIX), d && d.assist_kb_code);
    check('REVIEWED audit suggestion_kb_id sourced from assist', !!d && harvestSeeds.includes(Number(d.suggestion_kb_id)), d && d.suggestion_kb_id);
    check('REVIEWED audit final still captured', !!d && d.final_level_code === 'L2', d && d.final_level_code);

    // Stale-KB condition: KB row deactivated AFTER analyze; the persisted
    // snapshot must still let the coder Ignore + confirm manually.
    const staleBefore = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [staleItemId])).rows[0];
    check('stale item also review+assist', staleBefore && staleBefore.status === 'CODER_REVIEW' && assistKb(staleBefore).startsWith('KB-' + PREFIX), JSON.stringify(staleBefore && { status: staleBefore.status, code: staleBefore.assist_kb_code }));
    check('stale item snapshot level = L2', staleBefore && Number(staleBefore.assist_complexity_level_id) === Number(l2.id), staleBefore && staleBefore.assist_complexity_level_id);
    await query(`UPDATE kb_items SET is_active=FALSE WHERE id=$1`, [kbId]);
    check('assist snapshot survives KB deactivation', assistKb((await query(`SELECT assist_kb_code FROM classifications WHERE work_order_item_id=$1`, [staleItemId])).rows[0]).startsWith('KB-' + PREFIX), '');
    r = await api('POST', '/api/work-orders/items/' + staleItemId + '/review', coder, { complexity_level_id: l0.id, semantic_assist_response: 'IGNORED', notes: 'manual L0 instead' });
    check('stale-kb manual continue (IGNORED) 200', r.status === 200, 'status=' + r.status);
    const staleAfter = (await query(`SELECT * FROM classifications WHERE work_order_item_id=$1`, [staleItemId])).rows[0];
    check('stale-kb assist_response = IGNORED (not blocked)', staleAfter && staleAfter.assist_response === 'IGNORED', staleAfter && staleAfter.assist_response);

    // No-assist item review works WITHOUT a response.
    if (plainCls && plainCls.status === 'CODER_REVIEW') {
      r = await api('POST', '/api/work-orders/items/' + plainItemId + '/review', coder, { complexity_level_id: l2.id, notes: 'manual' });
      check('no-assist review without response 200', r.status === 200, 'status=' + r.status);
    } else {
      note('no-assist review skip', 'unrelated item did not land CODER_REVIEW (status=' + (plainCls && plainCls.status) + ')');
    }
  } catch (err) {
    check('verifier body', false, err.message);
  } finally {
    child.kill();
    const clean = async () => {
      const scratchKbIds = seededKbIds.length ? seededKbIds : null;
      const runOne = async (name, sql, params) => {
        try {
          const r = await query(sql, params);
          note('cleanup:' + name, r.rowCount);
        } catch (e) { note('cleanup:' + name, 'ERR ' + e.message.split('\n')[0]); }
      };
      if (scratchKbIds) {
        await runOne('cm-by-scratch-id', `DELETE FROM classification_matches WHERE kb_item_id = ANY($1)`, [scratchKbIds]);
        await runOne('cls-by-assist-kb', `UPDATE classifications SET assist_kb_id = NULL WHERE assist_kb_id = ANY($1)`, [scratchKbIds]);
        await runOne('kb-items-by-id', `DELETE FROM kb_items WHERE id = ANY($1)`, [scratchKbIds]);
      }
      const createdWos = [warmWo, woId].filter((x) => Number.isInteger(x));
      const leftovers = (await query('SELECT id FROM work_orders WHERE id = ANY($1)', [createdWos])).rows.map((x) => x.id);
      if (leftovers.length) {
        const itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [leftovers])).rows.map((x) => x.id);
        const steps = [
          ['audit_trail', `DELETE FROM audit_trail WHERE work_order_id = ANY($1)
             OR (entity_type='WORK_ORDER' AND entity_id = ANY($1))
             OR (entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($2))`, [leftovers, itemIds]],
          ['notifications', `DELETE FROM notifications WHERE entity_id = ANY($1)`, [leftovers]],
          ['classification_matches', `DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))`, [leftovers]],
          ['classifications', `DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [leftovers]],
          ['item_estimations', `DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, [leftovers]],
          ['production_tasks', `DELETE FROM production_tasks WHERE work_order_id = ANY($1)`, [leftovers]],
          ['work_order_documents', `DELETE FROM work_order_documents WHERE work_order_id = ANY($1)`, [leftovers]],
          ['work_order_access', `DELETE FROM work_order_access WHERE work_order_id = ANY($1)`, [leftovers]],
          ['work_order_items', `DELETE FROM work_order_items WHERE work_order_id = ANY($1)`, [leftovers]],
          ['kb-learned', `DELETE FROM kb_items WHERE kb_code = ANY($1)`, [itemIds.map((i) => 'KB-CODER-' + i)]],
          ['kb-marker', `DELETE FROM kb_items WHERE kb_code LIKE 'KB-CODER-%' AND title ILIKE ANY($1::text[])`, [HARNESS_TITLE_MARKERS.map((m) => '%' + m + '%')]],
          ['work_order_groups', `DELETE FROM work_order_groups WHERE work_order_id = ANY($1)`, [leftovers]],
          ['work_orders', `DELETE FROM work_orders WHERE id = ANY($1)`, [leftovers]],
        ];
        for (const [name, sql, params] of steps) {
          try { const r = await query(sql, params); note('cleanup:' + name, r.rowCount); }
          catch (e) { note('cleanup:' + name, 'ERR ' + e.message.split('\n')[0]); }
        }
      }
      // Secondary safety sweeps by prefix (covers aborted runs whose exact IDs weren't captured).
      await runOne('kb-prefix', `DELETE FROM kb_items WHERE kb_code LIKE 'KB-${PREFIX}-%' OR kb_code LIKE 'KB-SEED-%' OR kb_code LIKE 'KB-RB-%'`);
      return { createdWos, leftovers };
    };
    const cleaned = await clean();
    const users = (await query(`SELECT COUNT(*)::int c FROM users`)).rows[0].c;
    check('baseline users untouched', users === 5, 'users=' + users);
    const active = (await query(`SELECT COUNT(*)::int c FROM kb_items WHERE is_active=TRUE`)).rows[0].c;
    check('active KB count restored', active === baselineActive, 'active=' + active + ' baseline=' + baselineActive);
    const kbLeft = (await query(`SELECT COUNT(*)::int c FROM kb_items WHERE kb_code LIKE 'KB-${PREFIX}-%' OR kb_code LIKE 'KB-SEED-%' OR kb_code LIKE 'KB-RB-%'`)).rows[0].c;
    check('no KB-SA/KB-SEED/KB-RB leftovers', kbLeft === 0, 'leftover=' + kbLeft);
    const woLeft = (await query(`SELECT COUNT(*)::int c FROM work_orders WHERE wo_number LIKE '${PREFIX}%'`)).rows[0].c;
    check('no scratch WOs', woLeft === 0, 'wos=' + woLeft + ' created=' + JSON.stringify(cleaned.createdWos));
    const kvNow = (await query(`SELECT version FROM kb_corpus_version ORDER BY id DESC LIMIT 1`)).rows[0].version;
    check('kb_corpus_version monotonic', kvNow >= baselineKv, 'kv=' + kvNow + ' baseline=' + baselineKv);
  }
  console.log('\nRESULT ' + pass + ' PASS / ' + fail + ' FAIL');
  if (failLines.length) console.log('FAILED: ' + failLines.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });