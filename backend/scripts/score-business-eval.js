const fs = require('fs');
const path = require('path');

const SET_PATH = path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json');
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '-');

const set = JSON.parse(fs.readFileSync(SET_PATH, 'utf8'));
const reviewed = set.cases.filter((c) => c.review_status === 'REVIEWED' && c.prediction);
const unreviewed = set.cases.filter((c) => c.review_status !== 'REVIEWED');
const invalid = set.cases.filter((c) => c.review_status === 'REVIEWED' && c.failure_category === 'UNREVIEWED');
if (invalid.length) {
  console.log(`DATA INTEGRITY WARNING: ${invalid.length} REVIEWED cases still carry failure_category = UNREVIEWED:`);
  invalid.forEach((c) => console.log(`- ${c.id}`));
  console.log('Run repair-unreviewed-categories.js, then re-resolve them in review-eval.js.\n');
}

const bucket = (code, status) => code || (status === 'NON_FIRMWARE' ? 'L0' : 'none');

const rows = reviewed.map((c) => {
  const codeOk = bucket(c.expected_complexity_code, c.expected_status) === bucket(c.prediction.complexity_code, c.prediction.status);
  const statusOk = !c.expected_status || c.expected_status === c.prediction.status;
  const needsReview = c.prediction.status === 'CODER_REVIEW';
  return { ...c, codeOk, statusOk, correct: codeOk && statusOk, needsReview };
});
const correct = rows.filter((r) => r.correct);
const needReview = rows.filter((r) => !r.correct && r.needsReview);
const wrong = rows.filter((r) => !r.correct && !r.needsReview);

console.log('Business Evaluation Metrics (REVIEWED cases only)');
console.log('-------------------------------------------------');
console.log(`Cases total: ${set.cases.length} | reviewed: ${reviewed.length} | unreviewed: ${unreviewed.length}`);
console.log(`Accuracy: ${correct.length}/${reviewed.length} (${pct(correct.length, reviewed.length)}%)`);
console.log(`Incorrect rate: ${pct(wrong.length, reviewed.length)}%`);
console.log(`Needs Review rate: ${pct(needReview.length, reviewed.length)}%`);

console.log('\nConfusion by complexity level (expected -> predicted : count):');
const levels = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'none'];
const matrix = {};
for (const r of rows) {
  const e = bucket(r.expected_complexity_code, r.expected_status);
  const p = bucket(r.prediction.complexity_code, r.prediction.status);
  matrix[`${e} -> ${p}`] = (matrix[`${e} -> ${p}`] || 0) + 1;
}
console.log('        ' + levels.map((l) => l.padStart(5)).join(''));
for (const e of levels) {
  console.log(`  ${e.padEnd(5)}` + levels.map((p) => String(matrix[`${e} -> ${p}`] || 0).padStart(5)).join(''));
}

console.log('\nFailure-category distribution (reviewed incorrect + needs-review):');
const cats = {};
for (const r of [...wrong, ...needReview]) {
  const k = r.failure_category || 'UNREVIEWED';
  cats[k] = (cats[k] || 0) + 1;
}
if (!Object.keys(cats).length) console.log('(none — no failures among reviewed cases)');
Object.keys(cats).sort().forEach((k) => console.log(`- ${k}: ${cats[k]}`));

const lat = rows.map((r) => r.prediction.latency_ms || 0);
if (lat.length) {
  console.log(`\nLatency (ms): avg=${(lat.reduce((s, v) => s + v, 0) / lat.length).toFixed(1)} ` +
    `min=${Math.min(...lat)} max=${Math.max(...lat)}`);
}
if (unreviewed.length) console.log(`\nNOTE: ${unreviewed.length} cases still UNREVIEWED — metrics cover reviewed cases only.`);
