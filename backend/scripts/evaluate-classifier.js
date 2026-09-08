const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
require('dotenv').config();
const classificationService = require('../src/services/classificationService');
const kbCache = require('../src/services/kbCache');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const tierOf = (score) => (score >= 0.6 ? 'AUTO' : (score >= 0.35 ? 'SUGGEST' : 'NEW'));

const suggestCategory = (pred, expectedCode) => {
  const score = Number(pred.match_score) || 0;
  if (pred.status === 'CODER_REVIEW' && score <= 0) return 'missing_kb_entry (auto-suggested)';
  if (Math.abs(score - 0.6) < 0.05 || Math.abs(score - 0.35) < 0.05) return 'threshold_issue (auto-suggested)';
  if (pred.status !== 'CODER_REVIEW' && expectedCode) return 'incorrect_kb_entry (auto-suggested)';
  return 'UNREVIEWED';
};

const pct = (n) => (n * 100).toFixed(1);

(async () => {
  const tTotal = Date.now();
  const dataset = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'classifier-evaluation.json'), 'utf8'));

  const levels = await pool.query(`SELECT id, code FROM complexity_levels`);
  const codeById = new Map(levels.rows.map((r) => [r.id, r.code]));

  const prepared = await kbCache.getPreparedKb();
  const kbCodeById = new Map(prepared.rows.map((r) => [r.id, r.kb_code]));
  const kbCount = prepared.rowCount;

  const scored = dataset.cases.filter((c) => c.expected_complexity_code && !c.needs_pm_review);
  const pending = dataset.cases.filter((c) => !c.expected_complexity_code || c.needs_pm_review);

  const results = [];
  for (const c of scored) {
    const item = {
      title: c.title,
      description: c.description || '',
      quantity: c.quantity || 1,
      machine_model_id: c.machine_model_id ?? null,
      machine_model_version_id: c.machine_model_version_id ?? null,
    };
    const t0 = Date.now();
    const pred = await classificationService.classifyItem(item);
    const latencyMs = Date.now() - t0;
    const predCode = pred.complexity_level_id ? codeById.get(pred.complexity_level_id) : null;
    const codeOk = predCode === c.expected_complexity_code;
    const statusOk = !c.expected_status || pred.status === c.expected_status;
    const needsReview = pred.status === 'CODER_REVIEW';
    results.push({
      id: c.id, expectedCode: c.expected_complexity_code, expectedStatus: c.expected_status || null,
      predCode, predStatus: pred.status, correct: codeOk && statusOk, needsReview,
      score: pred.match_score, confidence: pred.confidence_score, method: pred.classification_method,
      kb: pred.kb_item_id ? kbCodeById.get(pred.kb_item_id) || null : null,
      rule: pred.rule_id || null, latencyMs, source: c.source || 'manual',
      input: `${c.title}${c.description ? ' / ' + c.description : ''}`,
    });
  }
  const totalMs = Date.now() - tTotal;

  const correct = results.filter((r) => r.correct);
  const needReview = results.filter((r) => !r.correct && r.needsReview);
  const wrong = results.filter((r) => !r.correct && !r.needsReview);
  const lat = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : 0;

  console.log('Evaluation Summary');
  console.log('------------------');
  console.log(`KB items: ${kbCount}`);
  console.log(`Evaluation cases: ${dataset.cases.length} (scored: ${results.length}, pending PM review: ${pending.length})`);
  console.log(`Correct: ${correct.length}`);
  console.log(`Incorrect: ${wrong.length}`);
  console.log(`Needs Review / No Decision: ${needReview.length}`);
  console.log(`Accuracy: ${results.length ? pct(correct.length / results.length) : '-'}%`);
  console.log(`Average latency: ${results.length ? (lat.reduce((s, v) => s + v, 0) / lat.length).toFixed(1) : '-'} ms`);
  console.log(`Min/Max/p95 latency: ${lat.length ? `${lat[0]}/${lat[lat.length - 1]}/${p95}` : '-'} ms`);
  console.log(`Total evaluation time: ${totalMs} ms`);
  const cache = kbCache.cacheStats();
  console.log(`KB cache: builds=${cache.builds} hits=${cache.hits}`);

  console.log('\nClassification Result Distribution');
  const dist = {};
  for (const r of results) {
    const k = `${r.predCode || 'none'} / ${r.predStatus} / ${r.method}`;
    dist[k] = (dist[k] || 0) + 1;
  }
  Object.keys(dist).sort().forEach((k) => console.log(`- ${k}: ${dist[k]}`));
  if (!results.length) console.log('(no scored cases yet)');

  const failures = [...wrong, ...needReview];
  console.log('\nFailure Analysis');
  console.log('----------------');
  if (!failures.length) {
    console.log(results.length ? 'No failures: every scored case matched.' : 'No scored cases to analyze.');
  }
  for (const r of failures) {
    console.log(`ID: ${r.id} [${r.needsReview ? 'needs-review' : 'incorrect'}]`);
    console.log(`  Input: ${r.input}`);
    console.log(`  Expected: ${r.expectedCode}${r.expectedStatus ? ' / ' + r.expectedStatus : ''}`);
    console.log(`  Predicted: ${r.predCode || 'none'} / ${r.predStatus} (${r.method})`);
    console.log(`  Score/confidence: match=${r.score} confidence=${r.confidence}`);
    console.log(`  KB match: ${r.kb || '-'} rule: ${r.rule || '-'}`);
    console.log(`  Tier: ${tierOf(Number(r.score) || 0)}`);
    console.log(`  Failure category: ${suggestCategory({ status: r.predStatus, match_score: r.score }, r.expectedCode)}`);
  }
  if (pending.length) {
    console.log('\nPending PM review (not scored, labels required):');
    pending.forEach((c) => console.log(`- ${c.id}: "${c.title}" [${c.category_hint || 'no hint'}]`));
  }

  console.log('\n21-probe regression:');
  try {
    const out = execFileSync(process.execPath,
      [path.join(__dirname, 'probe-gate.js')], { encoding: 'utf8', timeout: 120000 });
    const m = out.match(/GATE: pass=(\d+) fail=(\d+)/);
    console.log(m && Number(m[2]) === 0 ? '21-probe regression: PASS' : '21-probe regression: FAIL');
    if (!m || Number(m[2]) !== 0) console.log(out.trim().split('\n').filter((l) => l.startsWith('FAIL')).join('\n'));
  } catch (e) {
    const out = (e.stdout || '').toString();
    const m = out.match(/GATE: pass=(\d+) fail=(\d+)/);
    if (m) {
      console.log(Number(m[2]) === 0 ? '21-probe regression: PASS' : '21-probe regression: FAIL');
      console.log(out.trim().split('\n').filter((l) => l.startsWith('FAIL')).join('\n'));
    } else {
      console.log('21-probe regression: ERROR (gate script crashed)');
      console.log(String((e.message || e)).split('\n')[0]);
    }
  }
  await pool.end();
})().catch((e) => { console.error('EVALUATION FAILED:', e.message); process.exit(1); });
