const assert = require('assert');
const decider = require('../src/services/decider');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const row = {
  id: 9001, kb_code: 'KB-TEST', title: 'Emergency stop button', description: 'replace faulty unit',
  fw_related: true, complexity_level_id: 3, confidence_score: 90,
};
const rowText = `${row.title} ${row.description}`;
const itemText = 'Emergency stop button not working, replace faulty unit';
const matches = [{ kbCode: 'KB-TEST', score: 0.75 }];

const withMargin = async (floor, fn) => {
  const prev = process.env.SEMANTIC_MARGIN;
  process.env.SEMANTIC_MARGIN = String(floor);
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.SEMANTIC_MARGIN;
    else process.env.SEMANTIC_MARGIN = prev;
  }
};

(async () => {
  const verdict = decider.decideSemantic({ itemText, matches, margin: 0.31, rowText, row });
  eq(verdict.classification_method, 'SEMANTIC_CLASSIFICATION', 'decision: method recorded');
  eq(verdict.status, 'CLASSIFIED', 'decision: fw row auto-classifies');
  eq(verdict.kb_item_id, 9001, 'decision: winning row linked');
  eq(verdict.match_score, 0.75, 'decision: semantic score preserved');
  eq(verdict.confidence_score, 75, 'decision: confidence capped by similarity and row confidence');
  eq(verdict.complexity_level_id, 3, 'decision: complexity carried from row');
  ok(verdict.classification_reason.includes('KB-TEST'), 'decision: reason cites the row');

  eq(decider.decideSemantic({ itemText, matches, margin: 0.10, rowText, row }), null, 'floor: margin below 0.15 blocks');
  eq(decider.decideSemantic({ itemText, matches: [], margin: 0.5, rowText, row }), null, 'empty: no candidate blocks');
  eq(decider.decideSemantic({ itemText, matches: null, margin: 0.5, rowText, row }), null, 'missing: null matches blocks');
  eq(decider.decideSemantic({ itemText, matches, margin: 0.5, rowText, row: null }), null, 'missing: unresolved row blocks');

  const codedRow = { ...row, title: 'Controller board XJ-4800', description: 'replace' };
  const codedText = `${codedRow.title} ${codedRow.description}`;
  eq(decider.decideSemantic({
    itemText: 'Controller board faulty, replace unit',
    matches, margin: 0.5, rowText: codedText, row: codedRow,
  }), null, 'gate: row code token missing from item blocks');
  ok(decider.decideSemantic({
    itemText: 'Controller board XJ-4800 faulty, replace unit',
    matches, margin: 0.5, rowText: codedText, row: codedRow,
  }), 'gate: item carrying the row code passes');

  const nonFw = decider.decideSemantic({
    itemText, matches, margin: 0.31, rowText, row: { ...row, fw_related: false },
  });
  eq(nonFw.status, 'NON_FIRMWARE', 'routing: non-fw row routes out of review');
  eq(nonFw.complexity_level_id, null, 'routing: non-fw row carries no complexity');

  await withMargin(0.5, async () => {
    eq(decider.decideSemantic({ itemText, matches, margin: 0.3, rowText, row }), null, 'env: raised floor blocks');
    ok(decider.decideSemantic({ itemText, matches, margin: 0.6, rowText, row }), 'env: margin above raised floor passes');
  });

  const capped = decider.decideSemantic({
    itemText, matches: [{ kbCode: 'KB-TEST', score: 0.99 }], margin: 0.5, rowText,
    row: { ...row, confidence_score: 70 },
  });
  eq(capped.confidence_score, 70, 'cap: row confidence bounds the verdict');

  console.log(`test-semantic-decision: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
