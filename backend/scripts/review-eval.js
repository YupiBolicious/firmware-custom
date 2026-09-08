const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SET_PATH = path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json');
const CODES = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
const STATUSES = ['CLASSIFIED', 'NON_FIRMWARE', 'CODER_REVIEW'];
const CATEGORIES = [
  'synonym_or_different_wording', 'paraphrase', 'missing_kb_entry',
  'incorrect_kb_entry', 'normalization_issue', 'technical_term_mismatch',
  'model_version_context', 'threshold_issue', 'ambiguous', 'unknown',
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a.trim())));

const askRequired = async (label, valid, current) => {
  for (;;) {
    const hint = current ? ` (Enter keeps ${current})` : '';
    const raw = await ask(`${label}${hint}: `);
    const val = (raw || current || '').toUpperCase();
    if (valid.includes(val)) return val;
    console.log(`Required: one of ${valid.join('/')}. Use [s]kip at the command prompt to leave undecided.`);
  }
};

(async () => {
  const set = JSON.parse(fs.readFileSync(SET_PATH, 'utf8'));
  const queue = set.cases.filter((c) => c.review_status === 'UNREVIEWED' && c.prediction);
  if (!queue.length) {
    console.log('Nothing to review: no UNREVIEWED cases with predictions. Run run-business-eval.js first.');
    rl.close();
    return;
  }
  console.log(`${queue.length} UNREVIEWED cases. Commands: [a]pprove prediction  [c]orrect  [s]kip  [q]uit+save`);
  console.log(`Complexity codes: ${CODES.join(' ')} | Statuses: ${STATUSES.join(' ')}`);
  console.log(`Failure categories: ${CATEGORIES.join(' ')} (use 'unknown' when the cause cannot be determined)`);
  console.log('Rule: REVIEWED means you decided. [c]orrect requires code + status + category.');

  let done = 0;
  for (const c of queue) {
    const p = c.prediction;
    console.log(`\n--- ${c.id} [${c.category}] (${c.generated_by}${c.source_row ? ', from ' + c.source_row : ''}) ---`);
    console.log(`Input: "${c.title}"${c.description ? ' / "' + c.description + '"' : ''}`);
    console.log(`Predicted: ${p.complexity_code || 'none'} / ${p.status} (${p.method}) score=${p.match_score} kb=${p.kb_code || '-'}`);
    if (c.expected_complexity_code || c.expected_status) {
      console.log(`Current expected: ${c.expected_complexity_code || 'none'} / ${c.expected_status || 'none'}`);
    }
    const ans = (await ask('[a]pprove / [c]orrect / [s]kip / [q]uit: ')).toLowerCase();
    if (ans === 'q') break;
    if (ans === 's' || !ans) continue;
    if (ans === 'a') {
      c.expected_complexity_code = p.complexity_code;
      c.expected_status = p.status;
      c.review_status = 'REVIEWED';
      c.failure_category = null;
      c.reviewed_note = 'approved as predicted';
      done++;
    } else if (ans === 'c') {
      c.expected_complexity_code = await askRequired('Correct complexity code [L0-L5]', CODES, c.expected_complexity_code);
      c.expected_status = await askRequired('Correct status [CLASSIFIED/NON_FIRMWARE/CODER_REVIEW]', STATUSES, c.expected_status);
      c.failure_category = await askRequired("Failure category (or 'unknown')", CATEGORIES, null);
      c.review_status = 'REVIEWED';
      c.reviewed_note = 'corrected by reviewer';
      done++;
    } else {
      console.log('Unknown command, skipped.');
    }
    fs.writeFileSync(SET_PATH, JSON.stringify(set, null, 2));
  }
  console.log(`\nReviewed this session: ${done}. Progress saved to business-eval-set.json.`);
  console.log(`Remaining UNREVIEWED: ${set.cases.filter((c) => c.review_status === 'UNREVIEWED').length}`);
  rl.close();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
