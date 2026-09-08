const fs = require('fs');
const path = require('path');

const SET_PATH = path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json');
const BACKUP_PATH = `${SET_PATH}.pre-repair.bak`;

const set = JSON.parse(fs.readFileSync(SET_PATH, 'utf8'));
const broken = set.cases.filter(
  (c) => c.review_status === 'REVIEWED' && c.failure_category === 'UNREVIEWED'
);

console.log(`Found ${broken.length} REVIEWED cases with failure_category = UNREVIEWED (invalid combination).`);
if (!broken.length) return;
broken.forEach((c) => console.log(`  ${c.id}: expected=${c.expected_complexity_code || 'none'}/${c.expected_status || 'none'}`));

fs.writeFileSync(BACKUP_PATH, JSON.stringify(set, null, 2));
console.log(`Backup written to business-eval-set.json.pre-repair.bak`);

for (const c of broken) {
  c.review_status = 'UNREVIEWED';
  c.failure_category = null;
  c.reviewed_note = ((c.reviewed_note ? c.reviewed_note + '; ' : '') + 'reopened: failure cause unresolved').trim();
}
fs.writeFileSync(SET_PATH, JSON.stringify(set, null, 2));
console.log(`Reopened ${broken.length} cases (expected values preserved, predictions untouched).`);
console.log('Re-run review-eval.js to resolve each with a real category (or unknown).');
