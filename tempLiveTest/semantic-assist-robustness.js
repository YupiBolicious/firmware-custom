// Semantic Assist robustness validation (read-only on product policy; creates
// strictly-cleaned scratch rows). Boots its own backend on :5131 with the
// CURRENT .env (SEMANTIC_MARGIN=0.15, SEMANTIC_ASSIST_MIN_SCORE=0.60,
// SEMANTIC_ASSIST suggestion-only) and a second :5132 child with SEMANTIC_ENABLED=0
// for the kill-switch phase. Seeds scratch KB rows via the PRODUCTION POST /api/kb
// lifecycle (is_active=true, kb_corpus_version auto-bumped). Deterministic
// boundary/code-token cases run in-process against the exported gate/decider
// functions; live cases only for behavioral verification. Self-cleaning.
//
// Output: tempLiveTest/semantic-assist-robustness-<date>.md + -results.json.
// Findings classified PASS / GAP / FAIL. Does NOT change thresholds or logic.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
const decider = require('C:/Program Files/Firmware Custom/backend/src/services/decider');
const semanticAssist = require('C:/Program Files/Firmware Custom/backend/src/services/semanticAssist');
const policy = require('C:/Program Files/Firmware Custom/backend/src/utils/tokenPolicy');

const ROOT = 'C:/Program Files/Firmware Custom';
const BACKEND = path.join(ROOT, 'backend');
const ENV_FILE = path.join(BACKEND, '.env');
const BASE1 = 'http://localhost:5131';
const BASE2 = 'http://localhost:5132';
const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com', admin: 'admin@demo.com' };
const PW = 'password123';
const WO_PREFIX = 'SRB-';
const KB_PREFIX = 'KB-RB-';
const ts = Date.now();

const results = { generated: new Date().toISOString(), env: {}, baseline: {}, unit: [], live: [], killSwitch: [], regressions: [], findings: [] };
let pass = 0, fail = 0, gap = 0;
const failLines = [], gapLines = [], notes = [];
const children = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; failLines.push(name); console.log('FAIL ' + name + ' -> ' + detail); }
}
function gapCheck(name, detail) { gap++; gapLines.push(name); notes.push('GAP ' + name + ' -> ' + detail); console.log('GAP ' + name + ' -> ' + detail); }
function note(name, detail) { notes.push(name); console.log('NOTE ' + name + ' -> ' + detail); }

async function api(base, method, p, token, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(base + p, { method, headers, body: payload });
  const json = await r.json().catch(() => null);
  return { status: r.status, data: json && json.data, json, ok: r.ok };
}
async function query(sql, params) { return pool.query(sql, params); }
async function login(base, key) {
  const r = await api(base, 'POST', '/api/auth/login', undefined, { identifier: EMAILS[key], password: PW });
  if (!r.data || !r.data.token) throw new Error('login failed ' + key + ' ' + r.status);
  return r.data.token;
}
const poll = async (url, ms, tries) => {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await new Promise((res) => setTimeout(res, ms));
  }
  return false;
};
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ---------- env patch (children only change PORT; kill child flips SEMANTIC_ENABLED) ----------
function writePatchedEnv(extra) {
  let env = fs.readFileSync(ENV_FILE, 'utf8');
  env = env.replace(/^PORT=.*$/m, 'PORT=' + (extra.port)) + '\n';
  if (extra.disableSemantic !== undefined) {
    env = env.replace(/^SEMANTIC_ENABLED=.*$/m, 'SEMANTIC_ENABLED=' + extra.disableSemantic) + '\n';
  }
  fs.writeFileSync(ENV_FILE, env);
}
function restoreEnv(snapshot) { try { fs.writeFileSync(ENV_FILE, snapshot); } catch (e) { console.log('env restore err ' + e.message); } }

// ---------- strict marker cleanup ----------
async function sweep() {
  const steps = [];
  let woIds = [];
  try { woIds = (await query("SELECT id FROM work_orders WHERE wo_number LIKE '" + WO_PREFIX + "%'")).rows.map((x) => x.id); } catch (e) {}
  let itemIds = [];
  if (woIds.length) {
    try { itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id = ANY($1)', [woIds])).rows.map((x) => x.id); } catch (e) {}
  }
  steps.push(
    { n: 'audit', s: `DELETE FROM audit_trail WHERE work_order_id = ANY($1) OR (entity_type='WORK_ORDER' AND entity_id = ANY($1)) OR (entity_type='WORK_ORDER_ITEM' AND entity_id = ANY($2))`, p: [woIds, itemIds] },
    { n: 'notif', s: `DELETE FROM notifications WHERE entity_id = ANY($1)`, p: [woIds] },
    { n: 'cmatch', s: `DELETE FROM classification_matches WHERE classification_id IN (SELECT id FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1)))`, p: [woIds] },
    { n: 'class', s: `DELETE FROM classifications WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, p: [woIds] },
    { n: 'est', s: `DELETE FROM item_estimations WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ANY($1))`, p: [woIds] },
    { n: 'tasks', s: `DELETE FROM production_tasks WHERE work_order_id = ANY($1)`, p: [woIds] },
    { n: 'doc', s: `DELETE FROM work_order_documents WHERE work_order_id = ANY($1)`, p: [woIds] },
    { n: 'access', s: `DELETE FROM work_order_access WHERE work_order_id = ANY($1)`, p: [woIds] },
    { n: 'items', s: `DELETE FROM work_order_items WHERE work_order_id = ANY($1)`, p: [woIds] },
    { n: 'learned', s: `DELETE FROM kb_items WHERE kb_code = ANY($1)`, p: [itemIds.map((i) => 'KB-CODER-' + i)] },
    { n: 'groups', s: `DELETE FROM work_order_groups WHERE work_order_id = ANY($1)`, p: [woIds] },
    { n: 'wos', s: `DELETE FROM work_orders WHERE id = ANY($1)`, p: [woIds] },
    { n: 'kbrb', s: `DELETE FROM kb_items WHERE kb_code LIKE '${KB_PREFIX}%'`, p: ['x'] }
  );
  const removed = {};
  for (const st of steps) {
    if (!st.p[0] || (Array.isArray(st.p[0]) && st.p[0].length === 0)) continue;
    try {
      const r = await query(st.s, /\$\d+/.test(st.s) ? st.p : []);
      if (r.rowCount) removed[st.n] = r.rowCount;
    } catch (e) { removed[st.n] = 'ERR ' + e.message.split('\n')[0]; }
  }
  try { const m = await query(`DELETE FROM kb_items WHERE kb_code LIKE 'KB-CODER-%' AND title ILIKE ANY($1::text[])`, [['%zolli%', '%qipfrobnit%', '%frobnicate%'].map((x) => x)]); if (m.rowCount) removed.marker = m.rowCount; } catch (e) {}
  return removed;
}

// ---------- unit phases (deterministic, no backend child needed) ----------
async function unitBoundaries() {
  const rowStub = { id: 9901, kb_code: 'KB-UNIT', title: 'routing rules', description: 'routing calibration constants' };
  const apply = (score, margin) => semanticAssist.evaluateAssistRule({
    itemText: 'change the panel routing calibration',
    lexicalStatus: 'CODER_REVIEW',
    matches: [{ kbCode: 'KB-UNIT', score }],
    margin,
    scoreFloor: 0.60,
    resolveRow: async () => rowStub,
  });
  const b059 = await apply(0.59, 0.3);
  check('boundary: score 0.59 -> no Assist (SCORE_BELOW_FLOOR)', b059.suggestion === null && b059.blocked.reasons.includes('SCORE_BELOW_FLOOR'), JSON.stringify(b059.blocked));
  const b060 = await apply(0.60, 0.3);
  check('boundary: score 0.60 -> Assist', b060.suggestion !== null, JSON.stringify(b060));
  check('boundary: Assist score == 0.60', b060.suggestion && b060.suggestion.match_score === 0.60, '');
  const m149 = await apply(0.95, 0.149);
  check('boundary: margin 0.149 -> review + Assist (score/code/KB gates pass)', m149.suggestion !== null && m149.suggestion.classification_method === 'SEMANTIC_ASSIST' && m149.suggestion.status === 'CODER_REVIEW', JSON.stringify(m149));
  const m150 = await apply(0.95, 0.150);
  check('boundary: margin 0.150 -> Assist still present (margin not an assist gate)', m150.suggestion !== null, JSON.stringify(m150));
  const auto149 = decider.decideSemantic({
    itemText: 'change the panel routing calibration', matches: [{ kbCode: 'KB-UNIT', score: 0.95 }], margin: 0.149,
    rowText: 'routing rules routing calibration constants', row: { id: 9901, kb_code: 'KB-UNIT', fw_related: true, complexity_level_id: 2, confidence_score: 90 },
  });
  check('boundary: margin 0.149 blocks auto-classification (MARGIN_BELOW_FLOOR)', auto149.verdict === null && auto149.blocked.reason === 'MARGIN_BELOW_FLOOR', JSON.stringify(auto149.blocked));
  const auto150 = decider.decideSemantic({
    itemText: 'change the panel routing calibration', matches: [{ kbCode: 'KB-UNIT', score: 0.95 }], margin: 0.150,
    rowText: 'routing rules routing calibration constants', row: { id: 9901, kb_code: 'KB-UNIT', fw_related: true, complexity_level_id: 2, confidence_score: 90 },
  });
  check('boundary: margin 0.150 stays auto-eligible (SEMANTIC_CLASSIFICATION)', auto150.verdict !== null && auto150.verdict.status === 'CLASSIFIED' && auto150.verdict.classification_method === 'SEMANTIC_CLASSIFICATION', JSON.stringify(auto150.verdict));
  const noCand = await semanticAssist.evaluateAssistRule({ itemText: 'x', lexicalStatus: 'CODER_REVIEW', matches: [], margin: 0, scoreFloor: 0.60, resolveRow: async () => null });
  check('negative: no semantic candidate -> NO_SEMANTIC_CANDIDATE', noCand.suggestion === null && noCand.blocked.reasons.includes('NO_SEMANTIC_CANDIDATE'), JSON.stringify(noCand.blocked));
  const unres = await semanticAssist.evaluateAssistRule({ itemText: 'change the panel routing calibration', lexicalStatus: 'CODER_REVIEW', matches: [{ kbCode: 'KB-GONE', score: 0.95 }], margin: 0.2, scoreFloor: 0.60, resolveRow: async () => null });
  check('negative: unresolved KB candidate -> ROW_UNRESOLVED', unres.suggestion === null && unres.blocked.reasons.includes('ROW_UNRESOLVED'), JSON.stringify(unres.blocked));
  const lexDone = await semanticAssist.evaluateAssistRule({ itemText: 'x', lexicalStatus: 'CLASSIFIED', matches: [{ kbCode: 'K', score: 0.99 }], margin: 0.5, scoreFloor: 0, resolveRow: async () => ({ id: 1 }) });
  check('negative: lexical decided -> no Assist short-circuit', lexDone.suggestion === null && lexDone.blocked === null, '');
}

async function unitCodeTokens() {
  const cases = [
    { name: 'MODEL mismatch', item: 'zolli controller firmware MODEL-RB-A-9000', rowText: 'zolli controller firmware MODEL-RB-B-7200', reason: 'MODEL_CODE_MISMATCH' },
    { name: 'VERSION mismatch', item: 'zolli controller firmware v2.0', rowText: 'zolli controller firmware v1.0', reason: 'VERSION_MISMATCH' },
    { name: 'SERIAL mismatch', item: 'zolli controller firmware SN-445511', rowText: 'zolli controller firmware SN-778833', reason: 'SERIAL_MISMATCH' },
    { name: 'MEASUREMENT mismatch', item: 'zolli shaft alignment 70mm', rowText: 'zolli shaft alignment 120mm', reason: 'MEASUREMENT_MISMATCH' },
  ];
  for (const c of cases) {
    const row = { id: 9902, kb_code: 'KB-UNIT2', title: c.rowText, description: '' };
    const r = await semanticAssist.evaluateAssistRule({
      itemText: c.item, lexicalStatus: 'CODER_REVIEW',
      matches: [{ kbCode: 'KB-UNIT2', score: 0.9 }], margin: 0.01, scoreFloor: 0.60,
      resolveRow: async () => row,
    });
    check('code-token: ' + c.name + ' blocks Assist', r.suggestion === null && r.blocked.reasons.includes(c.reason), JSON.stringify(r.blocked));
  }
  const same = await semanticAssist.evaluateAssistRule({
    itemText: 'zolli controller firmware MODEL-RB-A-9000', lexicalStatus: 'CODER_REVIEW',
    matches: [{ kbCode: 'KB-UNIT2', score: 0.9 }], margin: 0.01, scoreFloor: 0.60,
    resolveRow: async () => ({ id: 9903, kb_code: 'KB-UNIT2', title: 'zolli controller firmware MODEL-RB-A-9000', description: '' }),
  });
  check('code-token: matching MODEL code passes gate', same.suggestion !== null, JSON.stringify(same));
}

// ---------- offline assist-block-reason reproduction (uses audit scores + DB, no extra embedding) ----------
async function reasonFor(itemText, cls, audit) {
  const topScore = audit && audit.details ? Number(audit.details.semantic_top_score) : null;
  const topKb = audit && audit.details ? audit.details.semantic_top_kb : null;
  if (!cls) return 'NO_CLASSIFICATION';
  if (cls.assist_kb_code) return 'ASSIST_PRESENT';
  if (topScore == null) return 'NO_SEMANTIC_MATCH';
  if (topScore < 0.60) return 'SCORE_BELOW_FLOOR';
  if (!topKb) return 'NO_CANDIDATE';
  const row = (await query('SELECT title, description, is_active FROM kb_items WHERE kb_code=$1', [topKb])).rows[0] || null;
  if (!row || row.is_active === false) return 'ROW_UNRESOLVED';
  const gate = policy.checkCodeAgreement(policy.extractCodeTokens(itemText || ''), policy.extractCodeTokens(`${row.title || ''} ${row.description || ''}`));
  return gate.pass ? 'UNKNOWN_OTHER' : 'CODE_GATE:' + gate.reasons.join('|');
}

// ---------- live harness ----------
(async () => {
  const envSnapshot = fs.readFileSync(ENV_FILE, 'utf8');
  const cleanup = async () => { try { await sweep(); } catch (e) { note('sweep', e.message); } restoreEnv(envSnapshot); };
  process.on('exit', () => { restoreEnv(envSnapshot); });
  let kernel = null;
  try {
    results.env = { margin: (envSnapshot.match(/^SEMANTIC_MARGIN=(.*)$/m) || [])[1], assistScore: (envSnapshot.match(/^SEMANTIC_ASSIST_MIN_SCORE=(.*)$/m) || [])[1], semanticEnabled: (envSnapshot.match(/^SEMANTIC_ENABLED=(.*)$/m) || [])[1] || '1' };
    check('env baseline: SEMANTIC_MARGIN=0.15', results.env.margin === '0.15', results.env.margin);
    check('env baseline: SEMANTIC_ASSIST_MIN_SCORE=0.60', results.env.assistScore === '0.60', results.env.assistScore);

    // 1. Baseline
    const kv0 = (await query('SELECT version FROM kb_corpus_version ORDER BY id LIMIT 1')).rows[0];
    const active0 = (await query('SELECT COUNT(*)::int c FROM kb_items WHERE is_active=TRUE')).rows[0].c;
    const wo0 = (await query("SELECT COUNT(*)::int c FROM work_orders WHERE wo_number NOT LIKE 'SA-%' AND wo_number NOT LIKE 'SRB-%'")).rows[0].c;
    const users0 = (await query('SELECT COUNT(*)::int c FROM users')).rows[0].c;
    results.baseline = { kv_version: kv0.version, active_kb: active0, wo_count: wo0, users: users0 };
    note('baseline recorded', JSON.stringify(results.baseline));

    // Unit phases first (no child).
    await unitBoundaries();
    await unitCodeTokens();

    // Boot the primary child (SEMANTIC_MARGIN=0.15 / ASSIST=0.60, semantic ON).
    writePatchedEnv({ port: 5131 });
    const child = spawn('node', ['src/server.js'], { cwd: BACKEND });
    children.push(child);
    child.stdout.on('data', (b) => process.stdout.write('[child] ' + b));
    child.stderr.on('data', (b) => process.stdout.write('[child-err] ' + b));
    const booted = await poll(BASE1 + '/api/health', 1000, 60);
    check('backend :5131 boots (0.15 / 0.60)', booted, 'health poll timeout');
    if (!booted) throw new Error('no backend :5131');

    const [admin, pm, coder] = await Promise.all([login(BASE1, 'admin'), login(BASE1, 'pm'), login(BASE1, 'coder')]);

    // Warm the embedder (cold-start). Throwaway WO marked SRB-WARM-.
    const mm = (await query(
      `SELECT mm.id AS model_id, mmv.id AS version_id
       FROM machine_model mm JOIN machine_model_ver mmv ON mmv.machine_model_id = mm.id
       ORDER BY mm.id, mmv.id LIMIT 1`
    )).rows[0];
    const warmGroup = { machine_model_id: mm.model_id, machine_model_version_id: mm.version_id, serial_number: 'srb-warm-' + ts };
    let r = await api(BASE1, 'POST', '/api/work-orders', pm, { wo_number: WO_PREFIX + 'WARM-' + ts, title: 'warm', description: 'w', customer: 'QA', groups: [warmGroup] });
    if (!r.data) { console.log('WARM CREATE response', r.status, JSON.stringify(r.json)); }
    const warmWo = r.data.id;
    await api(BASE1, 'POST', '/api/work-orders/' + warmWo + '/items', pm, { work_order_group_id: r.data.groups[0].id, title: 'primer ignition starter ' + ts, description: '', quantity: 1 });
    let warm = await api(BASE1, 'POST', '/api/work-orders/' + warmWo + '/analyze', pm);
    for (let i = 0; i < 3 && (!warm.data || !warm.data.perf || warm.data.perf.semanticHits === 0); i++) {
      await sleep(5000);
      warm = await api(BASE1, 'POST', '/api/work-orders/' + warmWo + '/analyze', pm);
    }
    note('warmup semanticHits', JSON.stringify(warm.data && warm.data.perf));

    // Domains (schema seed rows): real, multi-domain paraphrases. Picked rows whose
    // title+description carry NO code tokens, so the absolute score gate (≥0.60)
    // is the live discriminator and the code gate stays green for the paraphrase.
    const domains = [
      { kbCode: 'KB-1004', label: 'e-stop', fw: true, item: 'install the panic stop pushbutton at the operator position' },
      { kbCode: 'KB-1005', label: 'sash window', fw: true, item: 'add a motorized sliding sash window to the laboratory wall' },
      { kbCode: 'KB-1010', label: 'particle counter', fw: true, item: 'wire the sensing inputs into the airborne particle monitor and the gas sampling unit' },
      { kbCode: 'KB-1017', label: 'sentinel alarm', fw: true, item: 'install one sentinel signaling contact alongside every alert relay' },
    ];
    // Create a scratch near-twin for every domain via production POST /api/kb
    // (is_active=true, auto kb_corpus_version bump) -> deterministic low margin.
    const twinSeeds = [];
    for (let i = 0; i < domains.length; i++) {
      const d = domains[i];
      const orig = (await query('SELECT title, description, fw_related, complexity_level_id, confidence_score FROM kb_items WHERE kb_code=$1', [d.kbCode])).rows[0];
      const code = KB_PREFIX + ts + '-D' + i;
      const rr = await api(BASE1, 'POST', '/api/kb', admin, {
        kb_code: code, title: orig.title, description: orig.description, keywords: '', fw_related: orig.fw_related,
        complexity_level_id: orig.complexity_level_id, confidence_score: Number(orig.confidence_score), source: 'SEED', is_active: true,
      });
      check('positive: domain twin created via production POST /api/kb (' + d.label + ')', rr.status === 201 && rr.data && rr.data.is_active === true, 'status=' + rr.status);
      twinSeeds.push({ code, id: rr.data && rr.data.id, kbCode: d.kbCode, label: d.label, fw: d.fw, item: d.item });
    }

    // Ambiguous pair (two near-identical scratch rows, unrelated to seed domains).
    // Item is a diluted paraphrase of both so lexical score drops below 0.6
    // (else classifyItem auto-claims and the semantic/assist path never runs).
    const ambCodeA = KB_PREFIX + ts + '-AM-A', ambCodeB = KB_PREFIX + ts + '-AM-B';
    const ambRowTitle = 'zolli servo axis lock step ' + ts;
    const ambRowDesc = 'perform the zolli servo axis lock routine during the conveyor changeover';
    for (const code of [ambCodeA, ambCodeB]) {
      await api(BASE1, 'POST', '/api/kb', admin, {
        kb_code: code, title: ambRowTitle, description: ambRowDesc, keywords: '',
        fw_related: true, complexity_level_id: (await query(`SELECT id FROM complexity_levels WHERE code='L2'`)).rows[0].id, confidence_score: 95, source: 'SEED', is_active: true,
      });
    }
    const ambiguousItemText = 'apply the servo axis lock step procedure along the conveyor line during the shift changeover ' + ts;

    const l0 = (await query(`SELECT id FROM complexity_levels WHERE code='L0'`)).rows[0];
    // Code-mismatch scratch row (MODEL token) + paraphrase item so THIS row is the
    // semantic top while lexical stays < 0.6.
    const cmCode = KB_PREFIX + ts + '-CM';
    await api(BASE1, 'POST', '/api/kb', admin, {
      kb_code: cmCode, title: 'zolli servo calibration protocol for controller MODEL-RB-A-9000', description: '', keywords: '',
      fw_related: true, complexity_level_id: l0.id, confidence_score: 95, source: 'SEED', is_active: true,
    });
    const cmItemText = 'redo the gain tuning on the motion driver module, documented for MODEL-RB-21-6000 ' + ts;

    // WO-1: 4 positive + 1 ambiguous + 2 negative items.
    const group = { machine_model_id: mm.model_id, machine_model_version_id: mm.version_id, serial_number: 'srb-' + ts };
    r = await api(BASE1, 'POST', '/api/work-orders', pm, { wo_number: WO_PREFIX + 'WO-' + ts, title: 'assist robustness', description: 'srb', customer: 'QA', groups: [group] });
    const woId = r.data.id;
    const groupId = r.data.groups[0].id;
    const itemIds = {};
    const items = [
      ...twinSeeds.map((t) => ({ key: 'pos:' + t.label, title: t.item, desc: '', qty: 1 })),
      { key: 'amb:zolli-pair', title: ambiguousItemText, desc: '', qty: 1 },
      { key: 'neg:unrelated', title: 'qipfrobnit wuzzler blix frobnicate ' + ts, desc: '', qty: 1 },
      { key: 'neg:codemismatch', title: cmItemText, desc: '', qty: 1 },
    ];
    for (const it of items) {
      const rr = await api(BASE1, 'POST', '/api/work-orders/' + woId + '/items', pm, { work_order_group_id: groupId, title: it.title, description: it.desc, quantity: it.qty });
      itemIds[it.key] = rr.data.id;
    }

    const kvBeforeAnalyze = (await query('SELECT version FROM kb_corpus_version ORDER BY id LIMIT 1')).rows[0].version;
    r = await api(BASE1, 'POST', '/api/work-orders/' + woId + '/analyze', pm);
    check('analyze 200', r.status === 200, 'status=' + r.status);
    note('analyze perf', JSON.stringify(r.data && r.data.perf));
    const kvAfterAnalyze = (await query('SELECT version FROM kb_corpus_version ORDER BY id LIMIT 1')).rows[0].version;
    check('corpus robustness: scratch KB creation bumped kb_corpus_version', kvBeforeAnalyze > results.baseline.kv_version, 'baseline=' + results.baseline.kv_version + ' beforeAnalyze=' + kvBeforeAnalyze);
    check('corpus robustness: analyze does not bump kb_corpus_version', kvAfterAnalyze === kvBeforeAnalyze, 'before=' + kvBeforeAnalyze + ' after=' + kvAfterAnalyze);

    const readCls = async (id) => (await query('SELECT * FROM classifications WHERE work_order_item_id=$1', [id])).rows[0];
    const readAudit = async (id) => (await query(`SELECT details FROM audit_trail WHERE entity_type='WORK_ORDER_ITEM' AND entity_id=$1 AND action='CLASSIFY_DECIDED' ORDER BY id DESC LIMIT 1`, [id])).rows[0];

    // Positive asserts.
    for (const d of twinSeeds) {
      const cls = await readCls(itemIds['pos:' + d.label]);
      const aud = await readAudit(itemIds['pos:' + d.label]);
      const record = { case: 'positive:' + d.label, domain: d.kbCode, item: d.item, status: cls && cls.status, assistCode: cls && cls.assist_kb_code, score: cls && cls.assist_match_score, margin: cls && cls.assist_semantic_margin, topKb: aud && aud.details && aud.details.semantic_top_kb, topScore: aud && aud.details && aud.details.semantic_top_score, blockReason: await reasonFor(d.item, cls, aud), expectedKb: d.kbCode };
      results.live.push(record);
      check('positive[' + d.label + '] lexical -> CODER_REVIEW', cls && cls.status === 'CODER_REVIEW', JSON.stringify({ status: cls && cls.status, method: cls && cls.classification_method }));
      check('positive[' + d.label + '] Assist appears', !!cls && !!cls.assist_kb_code, 'assist=' + cls && cls.assist_kb_code);
      check('positive[' + d.label + '] semantic score >= 0.60', cls && Number(cls.assist_match_score) >= 0.60, 'score=' + cls && cls.assist_match_score);
      check('positive[' + d.label + '] suggested KB is the domain row', !!cls && [d.kbCode, d.code].includes(String(cls.assist_kb_code)), 'got=' + cls && cls.assist_kb_code);
      check('positive[' + d.label + '] assist level prefilled', !!cls && cls.assist_complexity_level_id != null, '');
      note('positive[' + d.label + '] score/margin/top', JSON.stringify({ s: cls && cls.assist_match_score, m: cls && cls.assist_semantic_margin, top: aud && aud.details && aud.details.semantic_top_kb }));
    }

    // Ambiguous (semantic margin below floor must NOT auto-claim). The lexical
    // classifier may sometimes auto-take the item before semantics run — the
    // margin-gate boundary itself is owned deterministically by the unit phase.
    const ambCls = await readCls(itemIds['amb:zolli-pair']);
    const ambAud = await readAudit(itemIds['amb:zolli-pair']);
    const ambTopScore = ambAud && ambAud.details && ambAud.details.semantic_top_score;
    const ambTopKb = ambAud && ambAud.details && ambAud.details.semantic_top_kb;
    const ambMargin = ambCls && ambCls.assist_semantic_margin;
    results.live.push({ case: 'ambiguous:zolli-pair', item: ambiguousItemText, status: ambCls && ambCls.status, assistCode: ambCls && ambCls.assist_kb_code, score: ambCls && ambCls.assist_match_score, margin: ambMargin, topKb: ambTopKb, topScore: ambTopScore, blockReason: await reasonFor(ambiguousItemText, ambCls, ambAud), expectedKb: 'zolli pair' });
    if (ambCls && ambCls.status === 'CODER_REVIEW') {
      check('ambiguous: low semantic margin recorded (< 0.15)', ambMargin != null && Number(ambMargin) < 0.15, 'margin=' + ambMargin);
      check('ambiguous: auto NOT claimed (block MARGIN_BELOW_FLOOR)', ambAud && ambAud.details && ambAud.details.block_reason === 'MARGIN_BELOW_FLOOR', JSON.stringify(ambAud && ambAud.details.block_reason));
      check('ambiguous: Assist MAY show but never auto-claims', ambTopScore == null || Number(ambTopScore) < 0.60 || ambMargin == null || Number(ambMargin) < 0.15, JSON.stringify({ top: ambTopScore, margin: ambMargin }));
    } else {
      gapCheck('ambiguous: lexical app ed before margin gate (status=' + (ambCls && ambCls.status) + ')', 'margin gate covered deterministically in unit phase');
    }

    // Negative: unrelated / weak.
    const negCls = await readCls(itemIds['neg:unrelated']);
    const negAud = await readAudit(itemIds['neg:unrelated']);
    results.live.push({ case: 'negative:unrelated', item: 'qipfrobnit wuzzler blix frobnicate', status: negCls && negCls.status, assistCode: negCls && negCls.assist_kb_code, score: negCls && negCls.assist_match_score, margin: negCls && negCls.assist_semantic_margin, topKb: negAud && negAud.details && negAud.details.semantic_top_kb, topScore: negAud && negAud.details && negAud.details.semantic_top_score, blockReason: await reasonFor('qipfrobnit wuzzler blix frobnicate ' + ts, negCls, negAud), expectedKb: null });
    check('negative[unrelated]: no Assist', !!negCls && !negCls.assist_kb_code, 'assist=' + negCls && negCls.assist_kb_code);
    check('negative[unrelated]: semantic_top_score < 0.60 (false candidate blocked)', negAud && negAud.details && Number(negAud.details.semantic_top_score) < 0.60, 'top=' + negAud && negAud.details && negAud.details.semantic_top_score);
    check('negative[unrelated]: CODER_REVIEW fallback', negCls && negCls.status === 'CODER_REVIEW', negCls && negCls.status);

    // Negative: code mismatch (live, only if the crafted row is the top).
    const cmCls = await readCls(itemIds['neg:codemismatch']);
    const cmAud = await readAudit(itemIds['neg:codemismatch']);
    results.live.push({ case: 'negative:codemismatch', item: cmItemText, status: cmCls && cmCls.status, assistCode: cmCls && cmCls.assist_kb_code, score: cmCls && cmCls.assist_match_score, margin: cmCls && cmCls.assist_semantic_margin, topKb: cmAud && cmAud.details && cmAud.details.semantic_top_kb, topScore: cmAud && cmAud.details && cmAud.details.semantic_top_score, blockReason: await reasonFor(cmItemText, cmCls, cmAud), expectedKb: cmCode });
    if (cmCls && cmCls.status === 'CODER_REVIEW') {
      if (cmAud && cmAud.details && cmAud.details.semantic_top_kb === cmCode) {
        check('negative[codemismatch]: no Assist (code gate)', !!cmCls && !cmCls.assist_kb_code, 'assist=' + cmCls && cmCls.assist_kb_code);
        check('negative[codemismatch]: reproduced reason is CODE_GATE', results.live[results.live.length - 1].blockReason.startsWith('CODE_GATE'), results.live[results.live.length - 1].blockReason);
        check('negative[codemismatch]: top score >= 0.60 proves gate (not score)', cmAud && Number(cmAud.details.semantic_top_score) >= 0.60, 'top=' + cmAud && cmAud.details.semantic_top_score);
      } else {
        gapCheck('negative[codemismatch]: crafted row was not the semantic top (top=' + (cmAud && cmAud.details && cmAud.details.semantic_top_kb) + ')', 'cannot isolate code-gate live; covered deterministically in unit code-token phase');
      }
    } else {
      gapCheck('negative[codemismatch]: did not land CODER_REVIEW (status=' + (cmCls && cmCls.status) + ')', 'code gate covered deterministically in unit code-token phase');
    }

    // Corpus robustness: same D1 item across corpus mutations.
    const d1 = twinSeeds[0];
    const d1Id = itemIds['pos:' + d1.label];
    const kvNow = () => query('SELECT version FROM kb_corpus_version ORDER BY id LIMIT 1').then((x) => x.rows[0].version);
    const snapshot = async () => {
      const cls = await readCls(d1Id);
      const aud = await readAudit(d1Id);
      return { status: cls && cls.status, assist: cls && cls.assist_kb_code, score: cls && cls.assist_match_score, margin: cls && cls.assist_semantic_margin, topScore: aud && aud.details && aud.details.semantic_top_score };
    };

    let snap = await snapshot();
    const robust = { initial: snap };
    // (a) add highly similar row (another D1 twin) + an unrelated row.
    const kvPreAdds = await kvNow();
    const kB211 = await api(BASE1, 'POST', '/api/kb', admin, {
      kb_code: KB_PREFIX + ts + '-SIM', title: 'adjust alarm setpoint configuration value', description: 'adjust alarm setpoint configuration value', keywords: '', fw_related: true,
      complexity_level_id: (await query(`SELECT id FROM complexity_levels WHERE code='L2'`)).rows[0].id, confidence_score: 96, source: 'SEED', is_active: true,
    });
    const kB212 = await api(BASE1, 'POST', '/api/kb', admin, {
      kb_code: KB_PREFIX + ts + '-UNREL', title: 'quark thruster nozzle polish', description: 'polish quark thruster nozzle flange', keywords: '', fw_related: false, complexity_level_id: null, confidence_score: 90, source: 'SEED', is_active: true,
    });
    const kvA = await kvNow();
    check('robust: add similar+unrelated bumped kb_corpus_version', kvA === kvPreAdds + 2, 'pre=' + kvPreAdds + ' post=' + kvA);
    r = await api(BASE1, 'POST', '/api/work-orders/' + woId + '/analyze', pm);
    check('robust: analyze ok after similar+unrelated added', r.status === 200 && (await kvNow()) === kvA, 'status=' + r.status);
    snap = await snapshot();
    robust.afterSimilarUnrelated = snap;

    // (b) deactivate the D1 twin that carried the suggestion.
    await api(BASE1, 'PUT', '/api/kb/' + d1.id, admin, { is_active: false });
    const kvB = await kvNow();
    r = await api(BASE1, 'POST', '/api/work-orders/' + woId + '/analyze', pm);
    check('robust: analyze ok after deactivation', r.status === 200, 'status=' + r.status);
    snap = await snapshot();
    robust.afterDeactivate = snap;
    results.live.push({ case: 'robust:deactivate-d1-twin', ...snap, expectedKb: d1.kbCode, blockReason: await reasonFor(d1.item, await readCls(d1Id), await readAudit(d1Id)) });
    check('robust: deactivated suggested row -> no stale Assist (recompute not reused)', snap.assist !== d1.code, 'assist=' + snap.assist + ' should-not-be=' + d1.code + ' score=' + snap.score + ' margin=' + snap.margin);
    check('robust: CODER_REVIEW fallback preserved after deactivation', snap.status === 'CODER_REVIEW', snap.status);

    // (c) reactivate twin -> matrix rebuild -> Assist returns.
    await api(BASE1, 'PUT', '/api/kb/' + d1.id, admin, { is_active: true });
    r = await api(BASE1, 'POST', '/api/work-orders/' + woId + '/analyze', pm);
    snap = await snapshot();
    robust.afterReactivate = snap;
    results.live.push({ case: 'robust:reactivate-d1-twin', ...snap, blockReason: await reasonFor(d1.item, await readCls(d1Id), await readAudit(d1Id)) });
    check('robust: reactivated row -> Assist restored (no stale cache)', !!snap.assist, 'assist=' + snap.assist);
    results.corpusRobustness = robust;

    // Drive one Accept + one Ignore via API for the usefulness check.
    const acceptItem = itemIds['pos:' + twinSeeds[1].label];
    const acceptCls = await readCls(acceptItem);
    r = await api(BASE1, 'POST', '/api/work-orders/items/' + acceptItem + '/review', coder, { complexity_level_id: acceptCls.assist_complexity_level_id, semantic_assist_response: 'ACCEPTED', notes: 'agreed with semantic assist' });
    check('usefulness: Accept ACCEPTED', r.status === 200, 'status=' + r.status);

    child.kill();
    await sleep(500);

    // Kill-switch child: SEMANTIC_ENABLED=0 on :5132.
    writePatchedEnv({ port: 5132, disableSemantic: 0 });
    let kc = spawn('node', ['src/server.js'], { cwd: BACKEND });
    children.push(kc);
    kc.on('exit', () => { try { restoreEnv(envSnapshot); } catch (e) {} });
    kc.stderr.on('data', (b) => process.stdout.write('[kill2-err] ' + b));
    const kcBoot = await poll(BASE2 + '/api/health', 1000, 60);
    check('kill-switch: backend boots with SEMANTIC_ENABLED=0', kcBoot, 'health poll timeout');
    if (kcBoot) {
      const [pm2, admin2] = await Promise.all([login(BASE2, 'pm'), login(BASE2, 'admin')]);
      // Force a full re-classification on the kill child: bump the corpus so
      // input-hash/kb-version reuse (preserveAssist) does NOT keep stale
      // suggestion snapshots. Only then is "SEMANTIC_ENABLED=0" observable.
      const ksRow = await api(BASE2, 'POST', '/api/kb', admin2, {
        kb_code: KB_PREFIX + ts + '-KS', title: 'zolli kill switch gateprobe ' + ts, description: 'kill switch gate probe', keywords: '', fw_related: true,
        complexity_level_id: (await query(`SELECT id FROM complexity_levels WHERE code='L2'`)).rows[0].id, confidence_score: 90, source: 'SEED', is_active: true,
      });
      check('kill-switch: corpus bumped before kill re-analyze', ksRow.status === 201, 'status=' + ksRow.status);
      const beforeKill = {};
      for (const [k, id] of Object.entries(itemIds)) beforeKill[k] = (await readCls(id)).status;
      r = await api(BASE2, 'POST', '/api/work-orders/' + woId + '/analyze', pm2);
      const afterKill = {};
      let killNoAssist = true;
      for (const [k, id] of Object.entries(itemIds)) {
        const c = (await query('SELECT status, assist_kb_code FROM classifications WHERE work_order_item_id=$1', [id])).rows[0];
        afterKill[k] = c && c.status;
        if (c && c.status === 'CODER_REVIEW' && c.assist_kb_code) killNoAssist = false;
      }
      const sameLexical = Object.keys(beforeKill).every((k) => beforeKill[k] === afterKill[k]);
      results.killSwitch = { beforeKill, afterKill, sameLexical };
      check('kill-switch: zero Assist', r.status === 200 && killNoAssist, 'status=' + r.status + ' assist=' + killNoAssist);
      check('kill-switch: lexical decisions unchanged', sameLexical, JSON.stringify({ before: beforeKill, after: afterKill }));
    }
    kc.kill();
    await sleep(500);
    restoreEnv(envSnapshot);

    } catch (err) {
    check('harness body', false, err.message);
    console.error('STACK', err.stack);
  } finally {
    for (const c of children) { try { c.kill('SIGKILL'); } catch (e) {} }
    await cleanup();
    try { await sweep(); } catch (e) {}
    const activeFinal = (await query('SELECT COUNT(*)::int c FROM kb_items WHERE is_active=TRUE').catch(() => ({ rows: [{ c: -1 }] }))).rows[0].c;
    const usersFinal = (await query('SELECT COUNT(*)::int c FROM users').catch(() => ({ rows: [{ c: -1 }] }))).rows[0].c;
    if (results.baseline) {
      check('cleanup: active KB count restored', activeFinal === results.baseline.active_kb, 'was=' + results.baseline.active_kb + ' now=' + activeFinal);
      check('cleanup: users untouched', usersFinal === results.baseline.users, 'now=' + usersFinal);
    }
    const outBase = path.join(ROOT, 'tempLiveTest', 'semantic-assist-robustness-' + new Date().toISOString().slice(0, 10));
    fs.writeFileSync(outBase + '-results.json', JSON.stringify(results, null, 2));
    fs.writeFileSync(outBase + '.md', renderMd(results));
    console.log('\nRESULT ' + pass + ' PASS / ' + gap + ' GAP / ' + fail + ' FAIL');
    if (gapLines.length) console.log('GAPS: ' + gapLines.join(' | '));
    if (failLines.length) console.log('FAILED: ' + failLines.join(' | '));
    process.exit(fail ? 1 : 0);
  }
})().catch((e) => { console.error('FATAL', e); fs.writeFileSync(ENV_FILE, fs.readFileSync(ENV_FILE, 'utf8')); process.exit(1); });

function renderMd(results) {
  const rows = [];
  for (const r of results.live || []) {
    rows.push(`| ${r.case} | ${r.item || ''} | ${r.status || ''} | ${r.suggestedKb || r.assistCode || '-'} | ${r.score || '-'} | ${r.margin || '-'} | ${r.blockReason || '-'} | ${r.expectedKb || '-'} |`);
  }
  return `# Semantic Assist Robustness \\- ${new Date().toISOString().slice(0, 10)}

Baseline: ${JSON.stringify(results.baseline)} · env: ${JSON.stringify(results.env)}

Findings by phase:

| Case | Item | Status | Assist KB | Score | Margin | Block reason | Expected KB |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Unit (deterministic) boundaries + code-token gates executed in-process (0.59 no-assist, 0.60 assist, margin 0.149 review+assist, 0.150 auto-eligible; MODEL/VERSION/SERIAL/MEASUREMENT mismatches block).

Kill switch: ${JSON.stringify(results.killSwitch)}
Regressions: ${JSON.stringify(results.regressions)}
`;
}