const assert = require('assert');
const classificationService = require('../src/services/classificationService');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const kbRow = {
  id: 9001, kb_code: 'KB-TEST', title: 'Mergepoint', description: '',
  keywords: '', fw_related: true, complexity_level_id: 3, confidence_score: 90,
};
const refs = { kbItems: [kbRow], rules: [] };
const item = (title) => ({
  title, description: '', quantity: 1, machine_model_id: null, machine_model_version_id: null,
});

const withFloor = async (floor, fn) => {
  const prev = process.env.LEXICAL_DICE_MIN_JACCARD;
  process.env.LEXICAL_DICE_MIN_JACCARD = String(floor);
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.LEXICAL_DICE_MIN_JACCARD;
    else process.env.LEXICAL_DICE_MIN_JACCARD = prev;
  }
};

(async () => {
  // a. Dice rescue works: spacing variant reaches the strong tier by default.
  const rescued = await classificationService.classifyItem(item('Merge Point'), refs);
  eq(rescued.classification_method, 'LEXICAL_SIMILARITY', 'rescue: spacing variant reaches strong tier');
  eq(rescued.status, 'CLASSIFIED', 'rescue: routing unchanged (auto-classified)');
  ok(rescued.match_score >= 0.6, 'rescue: score in auto band');

  // b. Dice alone blocked under a floor: same input drops to review tier.
  await withFloor(0.9, async () => {
    const blocked = await classificationService.classifyItem(item('Merge Point'), refs);
    eq(blocked.classification_method, 'SIMILARITY', 'gate: Dice-only candidate falls to SIMILARITY');
    eq(blocked.status, 'CODER_REVIEW', 'gate: falls to review path, not auto-claim');
    eq(blocked.confidence_score, null, 'gate: no confidence asserted on demotion');
    ok(blocked.classification_reason.includes('KB-TEST'), 'gate: suggestion (which row) preserved for the reviewer');
  });

  // c. Corroborated passes: title-identical input survives even a max floor.
  await withFloor(0.99, async () => {
    const kept = await classificationService.classifyItem(item('Mergepoint'), refs);
    eq(kept.classification_method, 'EXACT_MATCH', 'gate: deterministic identity bypasses the floor');
  });

  // d. Weak lexical cases still reach assist eligibility (review-routed, suggestion attached).
  await withFloor(0.9, async () => {
    const weak = await classificationService.classifyItem(item('Merge Point'), refs);
    eq(weak.status, 'CODER_REVIEW', 'assist eligibility: demoted case stays review-routed (assist can engage)');
  });

  // e. Disabled floor (default) preserves legacy behavior exactly.
  const legacy = await classificationService.classifyItem(item('Merge Point'), refs);
  eq(legacy.classification_method, 'LEXICAL_SIMILARITY', 'default floor 0: legacy behavior preserved');

  console.log(`test-dice-policy: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
