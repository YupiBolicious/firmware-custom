const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const lines = (src) => src.split('\n');

let fail = 0;
const check = (ok, msg) => {
  if (!ok) { fail++; console.log('LAYER_VIOLATION: ' + msg); }
};

const deciderLines = lines(read('src/services/decider.js'));
const matcherLines = lines(read('src/services/matcher.js'));

const isDef = (line, name) =>
  new RegExp(`^\\s*(const|let|var|function)\\s+${name}\\b`).test(line);

deciderLines.forEach((line, i) => {
  for (const fn of ['tokenize', 'jaccard', 'diceBigram', 'scorePair', 'scoreCandidates', 'contextBonus']) {
    if (!isDef(line, fn) && new RegExp(`\\b${fn}\\s*\\(`).test(line)) {
      check(false, `decider.js:${i + 1} calls scoring math (${fn})`);
    }
  }
});

matcherLines.forEach((line, i) => {
  for (const s of ['EXACT_MATCH', 'SIMILARITY', 'CODER_REVIEW', 'CLASSIFIED', 'NON_FIRMWARE', 'MANUAL']) {
    if (line.includes(`'${s}'`) || line.includes(`"${s}"`)) {
      check(false, `matcher.js:${i + 1} references policy string (${s})`);
    }
  }
});

console.log(fail === 0
  ? 'LAYER_GUARD: PASS (matcher has no policy strings, decider calls no scoring math)'
  : `LAYER_GUARD: FAIL (${fail})`);
process.exit(fail ? 1 : 0);
