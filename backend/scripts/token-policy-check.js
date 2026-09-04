const assert = require('assert');
const policy = require('../src/utils/tokenPolicy');
const legacy = require('../src/utils/textUtils');

let n = 0;
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };
const ok = (v, msg) => { n++; assert.ok(v, msg); };

for (const w of ['change', 'update', 'add', 'new', 'adjust']) {
  ok(policy.tokenize(w).has(policy.canonicalize(w)), `protected survives: ${w}`);
  ok(!legacy.buildKeywords(`x ${w} y`).split(',').includes(w), `legacy buildKeywords dropped: ${w}`);
  ok(policy.buildKeywords(`x ${w} y`).split(',').includes(policy.canonicalize(w)), `policy buildKeywords keeps: ${w}`);
}

// Tier 1: true function words dropped by both
for (const w of ['the', 'and', 'of', 'to', 'for', 'with']) {
  ok(!policy.tokenize(w).has(w), `functional dropped: ${w}`);
}

// Tier 2: canonical merges
eq([...policy.tokenize('configuration')], ['config'], 'configuration->config');
eq([...policy.tokenize('Modify menu tree modification')], ['modify', 'menu', 'tree'], 'modify merge');
eq([...policy.tokenize('use case')], ['usecase'], 'use case merge');

// Tier 3: noise dropped, codes kept
ok(!policy.tokenize('SN 987654321').has('987654321'), 'long serial dropped');
ok(policy.tokenize('AX 200').has('ax'), 'model code kept');
ok(policy.tokenize('L3').has('l3'), 'level code kept');

// normalize identical to legacy (RULE matching unaffected)
for (const s of ['Closed-loop Control!', 'Alarm Setpoint (v2.1)', 'KB-0001 test']) {
  eq(policy.normalize(s), legacy.normalize(s), `normalize parity: ${s}`);
}

// buildKeywords keeps protected + merges canonical
const kw = policy.buildKeywords('Change alarm setpoint configuration', 'Adjust alarm value', 'urgent');
for (const w of ['change', 'alarm', 'setpoint', 'config', 'adjust', 'urgent']) {
  ok(kw.split(',').includes(w), `keyword has: ${w}`);
}

// discriminative case from the audit: change/new/adjust stay distinct
const a = policy.tokenize('change alarm setpoint');
const b = policy.tokenize('new alarm setpoint');
const c = policy.tokenize('adjust alarm setpoint');
ok(a.has('change') && !a.has('new'), 'change distinct');
ok(b.has('new') && !b.has('change'), 'new distinct');
ok(c.has('adjust') && !c.has('change'), 'adjust distinct');

eq(policy.singularize('mergepoints'), 'mergepoint', 'plural mergepoints');
eq(policy.singularize('points'), 'point', 'plural points');
eq(policy.singularize('changes'), 'change', 'plural changes');
eq(policy.singularize('glass'), 'glass', 'glass kept');
eq(policy.singularize('status'), 'status', 'status kept');
eq(policy.singularize('l3'), 'l3', 'short code kept');
eq([...policy.tokenize('mergepoints')], ['mergepoint'], 'mergepoints token');
eq([...policy.tokenize('Merge Points')], ['merge', 'point'], 'points folded, space kept');

ok(policy.diceBigram('Mergepoint', 'Mergepoint') === 1, 'dice identical');
ok(policy.diceBigram('mergepoints', 'mergepoint') > 0.9, 'dice plural');
ok(policy.diceBigram('Merge Point', 'Mergepoint') > 0.5, 'dice compound rescued');
ok(policy.diceBigram('Merge Points', 'Mergepoint') > 0.6, 'dice plural compound rescued');
ok(policy.diceBigram('add', 'aid') === 0, 'dice short strings guarded');
ok(policy.diceBigram('Quantum flux deflector', 'Mergepoint') < 0.35, 'dice unrelated stays low');

console.log(`token-policy-check: OK (${n} assertions)`);
