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

const codesOf = (s) => [...policy.extractCodeTokens(s)];
eq(codesOf('AX-200 controller'), ['ax200'], 'code: hyphenated model');
eq(codesOf('SS304'), ['ss304'], 'code: letter-digit combo');
eq(codesOf('v1.0'), ['v10'], 'code: version format');
eq(codesOf('75mm'), ['75mm'], 'code: measurement with unit');
eq(codesOf('0.55 m/s'), ['055', 'ms'], 'code: decimal value splits to value + unit');
eq(codesOf('2'), [], 'not code: short pure digits (quantity)');
eq(codesOf('861'), [], 'not code: 3-digit pure digits');
eq(codesOf('a'), [], 'not code: single letter');
eq(codesOf('controller'), [], 'not code: plain word');
eq(codesOf('21334'), [], 'not code: pure digits even when long (documented exclusion)');

const gate = (a, b) => policy.checkCodeAgreement(policy.extractCodeTokens(a), policy.extractCodeTokens(b));
ok(gate('AX-200 controller', 'AX-200 controller').pass, 'gate: identical codes pass');
ok(!gate('AX-200 controller', 'AX-201 controller').pass, 'gate: differing codes fail');
eq(gate('AX-200 controller', 'AX-201 controller').reasons, ['MODEL_CODE_MISMATCH'], 'gate: model reason');
eq(gate('v1.0 firmware', 'v2.0 firmware').reasons, ['VERSION_MISMATCH'], 'gate: version reason');
eq(gate('SN21334 unit', 'SN99999 unit').reasons, ['SERIAL_MISMATCH'], 'gate: serial reason');
eq(gate('75mm bracket', '80mm bracket').reasons, ['MEASUREMENT_MISMATCH'], 'gate: measurement reason');
ok(gate('AX-200 controller', 'controller unit').pass, 'gate: generic KB row without codes stays allowed');
ok(gate('plain text here', 'other plain text').pass, 'gate: codeless pairs unaffected');
eq(policy.checkCodeAgreement(new Set(['ax200']), new Set(['ax200'])).failed, [], 'gate: no failures listed on pass');

console.log(`token-policy-check: OK (${n} assertions)`);
