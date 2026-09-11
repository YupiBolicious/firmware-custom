const fs = require('fs');
const path = require('path');
const assert = require('assert');
require('dotenv').config();
const { Pool } = require('pg');
const classificationService = require('../src/services/classificationService');
const classifyFlow = require('../src/services/classifyFlow');
const decider = require('../src/services/decider');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const kbCache = require('../src/services/kbCache');
const policy = require('../src/utils/tokenPolicy');

const DEFAULT_FLOOR = '0.15';
const initialMargin = process.env.SEMANTIC_MARGIN;
const initialEnabled = process.env.SEMANTIC_ENABLED;
const origDecideRef = decider.decideSemantic;
const cases = [];
const failures = [];
let n = 0;
const summary = {
  flows: 0, auto: 0, correctAuto: 0, wrongAuto: 0,
  blockedCorrectTop: 0, blockedMargin: 0, blockedSafety: 0, failureSims: 0, failureSimsOk: 0,
};

const check = (req, row, cond, note) => {
  n++;
  const id = 'C' + String(n).padStart(2, '0');
  const pass = !!cond;
  cases.push({ case: id, req, pass, note: note || '', ...row });
  console.log(`${pass ? 'ok' : 'FAIL'} ${id} req${req} ${row.input} -> ${row.verdict} (expect ${row.expected})${note ? ' [' + note + ']' : ''}`);
  if (!pass) failures.push(id);
  return pass;
};

const withEnv = async (name, value, fn) => {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = String(value);
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
};

const stub = (obj, key, fn) => {
  const orig = obj[key];
  obj[key] = fn;
  return () => { obj[key] = orig; };
};

const gateOf = async (itemText, top) => {
  if (!top) return 'N/A';
  const prepared = await kbCache.getPreparedKb();
  const row = prepared.rows.find((r) => r.kb_code === top.kbCode);
  if (!row) return 'N/A';
  const gate = policy.checkCodeAgreement(
    policy.extractCodeTokens(itemText || ''),
    policy.extractCodeTokens(`${row.title || ''} ${row.description || ''}`));
  return gate.pass ? 'PASS' : 'FAIL';
};

(async () => {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const kbAll = await pool.query('SELECT id, kb_code FROM kb_items WHERE is_active = TRUE');
  const codeById = Object.fromEntries(kbAll.rows.map((r) => [r.id, r.kb_code]));
  const nonFwRows = await pool.query(
    `SELECT id, kb_code, title, description, fw_related, complexity_level_id, confidence_score
     FROM kb_items WHERE is_active = TRUE AND fw_related = FALSE ORDER BY id LIMIT 1`);
  await pool.end();
  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'paraphrase-probes.json'), 'utf8'));
  const mkItem = (p) => ({
    title: p.title, description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1,
  });
  const kbOf = (flowed) => (flowed.result.kb_item_id != null ? (codeById[flowed.result.kb_item_id] || '?') : '-');
  const verdictOf = (flowed, kb) => (flowed.path === 'semantic'
    ? `DECISION:${kb}` : `${flowed.path.toUpperCase()}:${flowed.result.classification_method}`);

  const baseline = [];
  await withEnv('SEMANTIC_MARGIN', DEFAULT_FLOOR, async () => {
    for (const p of probes) {
      const item = mkItem(p);
      const flowed = await classifyFlow.classifyFlow(item);
      const lexical = await classificationService.classifyItem(item);
      const top = flowed.semantic && flowed.semantic.topMatches && flowed.semantic.topMatches[0];
      const kb = kbOf(flowed);
      const gate = await gateOf(`${item.title} ${item.description}`.trim(), top);
      summary.flows++;
      if (flowed.path === 'semantic') {
        summary.auto++;
        if (kb === p.expectedKb) summary.correctAuto++;
        else summary.wrongAuto++;
      } else {
        if (top && top.kbCode === p.expectedKb) summary.blockedCorrectTop++;
        const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
        if (reason === 'MARGIN_BELOW_FLOOR') summary.blockedMargin++;
        else summary.blockedSafety++;
      }
      const row = {
        input: p.title, expectedKb: p.expectedKb,
        lexical: `${lexical.status}/${lexical.classification_method}@${Number(lexical.match_score || 0).toFixed(2)}`,
        semTop: top ? top.kbCode : '-', semScore: top ? Number(top.score.toFixed(3)) : null,
        semMargin: flowed.semantic ? Number(flowed.semantic.margin.toFixed(3)) : null,
        gate, path: flowed.path, verdict: verdictOf(flowed, kb), expected: 'no-wrong-auto',
      };
      baseline.push({ probe: p, item, flowed, top, kb, gate });
      check('3+table', row, flowed.path !== 'semantic' || kb === p.expectedKb, kb);
    }
  });

  const cand = baseline.find((b) => b.top && b.top.kbCode === b.probe.expectedKb
    && b.gate === 'PASS' && b.flowed.semantic && b.flowed.semantic.margin < 0.14
    && b.flowed.path === 'review');
  check('1-pre', {
    input: '(select eligible probe)', expectedKb: '-', lexical: '-', semTop: '-', semScore: null,
    semMargin: null, gate: '-', path: '-', verdict: cand ? cand.probe.id : 'none', expected: 'eligible-probe',
  }, !!cand, cand ? cand.probe.id : 'no eligible probe');
  if (cand) {
    const m = cand.flowed.semantic.margin;
    await withEnv('SEMANTIC_MARGIN', String(m - 0.01), async () => {
      const flowed = await classifyFlow.classifyFlow(cand.item);
      const kb = kbOf(flowed);
      summary.flows++;
      if (flowed.path === 'semantic') {
        summary.auto++;
        if (kb === cand.probe.expectedKb) summary.correctAuto++;
        else summary.wrongAuto++;
      }
      check('1', {
        input: cand.probe.title, expectedKb: cand.probe.expectedKb,
        lexical: '-', semTop: (flowed.semantic.topMatches[0] || {}).kbCode || '-',
        semScore: Number(flowed.semantic.topMatches[0].score.toFixed(3)),
        semMargin: Number(flowed.semantic.margin.toFixed(3)), gate: 'PASS',
        path: flowed.path, verdict: verdictOf(flowed, kb), expected: `DECISION:${cand.probe.expectedKb}`,
      }, flowed.path === 'semantic' && kb === cand.probe.expectedKb
        && flowed.result.classification_method === 'SEMANTIC_CLASSIFICATION', `floor=${(m - 0.01).toFixed(3)}`);
    });
    await withEnv('SEMANTIC_MARGIN', String(m + 0.05), async () => {
      const flowed = await classifyFlow.classifyFlow(cand.item);
      summary.flows++;
      const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
      if (reason === 'MARGIN_BELOW_FLOOR') summary.blockedMargin++;
      else summary.blockedSafety++;
      check('2', {
        input: cand.probe.title, expectedKb: cand.probe.expectedKb,
        lexical: `${flowed.result.status}/${flowed.result.classification_method}`,
        semTop: (flowed.semantic.topMatches[0] || {}).kbCode || '-',
        semScore: Number(flowed.semantic.topMatches[0].score.toFixed(3)),
        semMargin: Number(flowed.semantic.margin.toFixed(3)), gate: 'PASS',
        path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+MARGIN_BELOW_FLOOR',
      }, flowed.path === 'review' && flowed.result.status === 'CODER_REVIEW'
        && reason === 'MARGIN_BELOW_FLOOR', `floor=${(m + 0.05).toFixed(3)}`);
    });
  }

  const gateCase = baseline.find((b) => b.gate === 'FAIL' && b.flowed.path === 'review');
  check('4-pre', gateCase ? {
    input: gateCase.probe.title, expectedKb: gateCase.probe.expectedKb,
    lexical: '-', semTop: (gateCase.top || {}).kbCode || '-',
    semScore: gateCase.top ? Number(gateCase.top.score.toFixed(3)) : null,
    semMargin: Number(gateCase.flowed.semantic.margin.toFixed(3)), gate: 'FAIL',
    path: '-', verdict: 'eligible', expected: 'code-gate-eligible',
  } : {
    input: '(code-gate case)', expectedKb: '-', lexical: '-', semTop: '-', semScore: null,
    semMargin: null, gate: '-', path: '-', verdict: 'none', expected: 'code-gate-eligible',
  }, !!gateCase, gateCase ? gateCase.probe.id : 'no code-gate case in probe set');
  if (gateCase) {
    const gm = gateCase.flowed.semantic.margin;
    await withEnv('SEMANTIC_MARGIN', String(gm - 0.01), async () => {
      const item = mkItem(gateCase.probe);
      const flowed = await classifyFlow.classifyFlow(item);
      summary.flows++;
      const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
      if (reason === 'MARGIN_BELOW_FLOOR') summary.blockedMargin++;
      else summary.blockedSafety++;
      check('4', {
        input: item.title, expectedKb: gateCase.probe.expectedKb,
        lexical: `${flowed.result.status}/${flowed.result.classification_method}`,
        semTop: (flowed.semantic.topMatches[0] || {}).kbCode || '-',
        semScore: Number(flowed.semantic.topMatches[0].score.toFixed(3)),
        semMargin: Number(flowed.semantic.margin.toFixed(3)), gate: 'FAIL',
        path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+CODE_GATE',
      }, flowed.path === 'review' && flowed.result.status === 'CODER_REVIEW' && reason === 'CODE_GATE',
      `floor=${(gm - 0.01).toFixed(3)} margin-first-then-gate`);
    });
  }

  await withEnv('SEMANTIC_MARGIN', DEFAULT_FLOOR, async () => {
    const restoreRetrieve = stub(semanticStore, 'retrieve', () => ({
      matches: [{ kbCode: 'KB-DOES-NOT-EXIST', score: 0.95 }], margin: 0.9,
    }));
    try {
      const item = mkItem(probes[0]);
      const flowed = await classifyFlow.classifyFlow(item);
      summary.flows++;
      summary.blockedSafety++;
      const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
      check('5', {
        input: item.title, expectedKb: probes[0].expectedKb,
        lexical: `${flowed.result.status}/${flowed.result.classification_method}`,
        semTop: 'KB-DOES-NOT-EXIST', semScore: 0.95, semMargin: 0.9, gate: 'N/A',
        path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+ROW_UNRESOLVED',
      }, flowed.path === 'review' && flowed.result.status === 'CODER_REVIEW' && reason === 'ROW_UNRESOLVED', reason);
    } finally {
      restoreRetrieve();
    }
    const restoreThrow = stub(embedder, 'embed', async () => { throw new Error('simulated embed failure'); });
    try {
      const item = mkItem(probes[0]);
      const flowed = await classifyFlow.classifyFlow(item);
      summary.flows++;
      summary.failureSims++;
      const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
      const pass = flowed.path === 'review' && flowed.result.status === 'CODER_REVIEW'
        && flowed.semantic === null && reason === 'NO_SEMANTIC';
      if (pass) summary.failureSimsOk++;
      check('6a', {
        input: item.title, expectedKb: probes[0].expectedKb,
        lexical: `${flowed.result.status}/${flowed.result.classification_method}`,
        semTop: '-', semScore: null, semMargin: null, gate: 'N/A',
        path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+NO_SEMANTIC',
      }, pass, reason);
    } finally {
      restoreThrow();
    }
    const restoreNull = stub(embedder, 'embed', async () => [null]);
    try {
      const item = mkItem(probes[0]);
      const flowed = await classifyFlow.classifyFlow(item);
      summary.flows++;
      summary.failureSims++;
      const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
      const pass = flowed.path === 'review' && flowed.result.status === 'CODER_REVIEW' && reason === 'NO_CANDIDATE';
      if (pass) summary.failureSimsOk++;
      check('6b', {
        input: item.title, expectedKb: probes[0].expectedKb,
        lexical: `${flowed.result.status}/${flowed.result.classification_method}`,
        semTop: '-', semScore: null, semMargin: null, gate: 'N/A',
        path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+NO_CANDIDATE',
      }, pass, reason);
    } finally {
      restoreNull();
    }
    const restoreDecideThrow = stub(decider, 'decideSemantic', () => { throw new Error('simulated decider failure'); });
    try {
      const item = mkItem(probes[0]);
      const flowed = await classifyFlow.classifyFlow(item);
      summary.flows++;
      summary.failureSims++;
      const reason = flowed.decisionBlocked ? flowed.decisionBlocked.reason : null;
      const pass = flowed.path === 'review' && flowed.result.status === 'CODER_REVIEW' && reason === 'ERROR';
      if (pass) summary.failureSimsOk++;
      check('6c', {
        input: item.title, expectedKb: probes[0].expectedKb,
        lexical: `${flowed.result.status}/${flowed.result.classification_method}`,
        semTop: '-', semScore: null, semMargin: null, gate: 'N/A',
        path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+ERROR',
      }, pass, reason);
    } finally {
      restoreDecideThrow();
    }
  });

  let calls = 0;
  const origDecide = decider.decideSemantic;
  decider.decideSemantic = (...args) => { calls++; return origDecide(...args); };
  try {
    const strong = { title: 'Emergency stop button', description: 'Emergency stop button', quantity: 1 };
    const before = JSON.stringify(strong);
    const flowed = await classifyFlow.classifyFlow(strong);
    const mutated = JSON.stringify(strong) !== before;
    const direct = await classificationService.classifyItem(
      { title: 'Emergency stop button', description: 'Emergency stop button', quantity: 1 });
    summary.flows++;
    let parity = false;
    try {
      assert.deepStrictEqual(flowed.result, direct);
      parity = true;
    } catch {
      parity = false;
    }
    check('7', {
      input: strong.title, expectedKb: '-', lexical: `${direct.status}/${direct.classification_method}`,
      semTop: '-', semScore: null, semMargin: null, gate: 'N/A',
      path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'LEXICAL+decideSemantic-uncalled',
    }, flowed.path === 'lexical' && flowed.semantic === null && calls === 0 && parity, `calls=${calls} input-mutated=${mutated}`);
  } finally {
    decider.decideSemantic = origDecide;
  }

  await withEnv('SEMANTIC_ENABLED', '0', async () => {
    const item = mkItem(probes[0]);
    const flowed = await classifyFlow.classifyFlow(item);
    const direct = await classificationService.classifyItem(mkItem(probes[0]));
    summary.flows++;
    let parity = false;
    try {
      assert.deepStrictEqual(flowed.result, direct);
      parity = true;
    } catch {
      parity = false;
    }
    check('8', {
      input: item.title, expectedKb: probes[0].expectedKb,
      lexical: `${direct.status}/${direct.classification_method}`,
      semTop: '-', semScore: null, semMargin: null, gate: 'N/A',
      path: flowed.path, verdict: verdictOf(flowed, kbOf(flowed)), expected: 'REVIEW+lexical-unchanged',
    }, flowed.path === 'review' && flowed.semantic === null && flowed.assist === null && parity, 'kill-switch');
  });

  const liveNonFw = nonFwRows.length === 1;
  check('9-pre', {
    input: '(real non-FW KB row)', expectedKb: '-', lexical: '-', semTop: '-', semScore: null,
    semMargin: null, gate: '-', path: '-', verdict: liveNonFw ? nonFwRows[0].kb_code : 'none',
    expected: liveNonFw ? 'non-FW-row-exists' : 'synthetic-row-fallback',
  }, true, liveNonFw ? '' : 'corpus has no fw_related=false rows; NON_FIRMWARE path unreachable live');
  {
    const row = liveNonFw ? nonFwRows[0] : {
      id: 9901, kb_code: 'KB-SYNTH-NF', title: 'Non firmware office supply request', description: 'stationery',
      fw_related: false, complexity_level_id: 1, confidence_score: 80,
    };
    const text = `${row.title || ''} ${row.description || ''}`.trim();
    const out = decider.decideSemantic({
      itemText: text, matches: [{ kbCode: row.kb_code, score: 0.8 }], margin: 0.5, rowText: text, row,
    });
    check('9', {
      input: text.slice(0, 60), expectedKb: row.kb_code,
      lexical: '-', semTop: row.kb_code, semScore: 0.8, semMargin: 0.5, gate: 'PASS',
      path: 'semantic', verdict: out.verdict ? `DECISION:${row.kb_code}/${out.verdict.status}` : 'BLOCKED',
      expected: `DECISION:${row.kb_code}/NON_FIRMWARE`,
    }, !!out.verdict && out.verdict.status === 'NON_FIRMWARE'
      && out.verdict.complexity_level_id === null
      && out.verdict.classification_method === 'SEMANTIC_CLASSIFICATION', row.kb_code);
  }

  await withEnv('SEMANTIC_MARGIN', undefined, async () => {
    const base = {
      itemText: 'Emergency stop button not working, replace faulty unit',
      matches: [{ kbCode: 'KB-TEST', score: 0.75 }], rowText: 'Emergency stop button replace faulty unit',
      row: {
        id: 9001, kb_code: 'KB-TEST', title: 'Emergency stop button', description: 'replace faulty unit',
        fw_related: true, complexity_level_id: 3, confidence_score: 90,
      },
    };
    const atFloor = decider.decideSemantic({ ...base, margin: 0.15 });
    check('10a', {
      input: '(boundary)', expectedKb: 'KB-TEST', lexical: '-', semTop: 'KB-TEST', semScore: 0.75,
      semMargin: 0.15, gate: 'PASS', path: 'semantic',
      verdict: atFloor.verdict ? 'DECISION' : 'BLOCKED', expected: 'DECISION',
    }, !!atFloor.verdict, 'margin == floor fires (>=)');
    const belowFloor = decider.decideSemantic({ ...base, margin: 0.1499 });
    check('10b', {
      input: '(boundary)', expectedKb: 'KB-TEST', lexical: '-', semTop: 'KB-TEST', semScore: 0.75,
      semMargin: 0.1499, gate: 'PASS', path: 'review',
      verdict: belowFloor.verdict ? 'DECISION' : 'BLOCKED', expected: 'BLOCKED+MARGIN_BELOW_FLOOR',
    }, !belowFloor.verdict && belowFloor.blocked && belowFloor.blocked.reason === 'MARGIN_BELOW_FLOOR', 'margin < floor blocks');
  });

  const envClean = process.env.SEMANTIC_MARGIN === initialMargin
    && process.env.SEMANTIC_ENABLED === initialEnabled
    && decider.decideSemantic === origDecideRef;
  console.log(`env/stubs restored: ${envClean ? 'yes' : 'CHECK'}`);

  fs.writeFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'semantic-decision-coverage.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(), defaultFloor: Number(DEFAULT_FLOOR), summary, cases,
    }, null, 2));
  console.log(`summary: flows=${summary.flows} auto=${summary.auto} correctAuto=${summary.correctAuto} ` +
    `wrongAuto=${summary.wrongAuto} blockedCorrectTop=${summary.blockedCorrectTop} ` +
    `blockedMargin=${summary.blockedMargin} blockedSafety=${summary.blockedSafety} ` +
    `failureSims=${summary.failureSimsOk}/${summary.failureSims}`);
  console.log(`coverage: ${failures.length === 0 ? `OK (${cases.length} cases)` : `FAIL (${failures.join(',')})`}`);
  await embedder.shutdown();
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
