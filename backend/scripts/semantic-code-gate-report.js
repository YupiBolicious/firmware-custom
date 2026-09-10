const fs = require('fs');
const path = require('path');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const policy = require('../src/utils/tokenPolicy');

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

(async () => {
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const reviewed = set.cases.filter((c) => c.review_status === 'REVIEWED');
  const matrix = await semanticStore.getMatrix();

  const kbCache = require('../src/services/kbCache');
  const preparedKb = await kbCache.getPreparedKb();
  const titleByCode = Object.fromEntries(
    preparedKb.rows.map((r) => [r.kb_code, `${r.title || ''} ${r.description || ''}`]));
  const { Pool } = require('pg');
  require('dotenv').config();
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const lv = await pool.query(
    `SELECT kb.kb_code, cl.code AS cx FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id WHERE kb.is_active = TRUE`);
  const cxByCode = Object.fromEntries(lv.rows.map((r) => [r.kb_code, r.cx]));
  await pool.end();

  const bucket = (code, status) => code || (status === 'NON_FIRMWARE' ? 'L0' : 'none');
  const texts = reviewed.map((c) => `${c.title} ${c.description || ''}`.trim());
  const BATCH = 12;
  const vecs = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    vecs.push(...(await embedder.embed(texts.slice(i, i + BATCH))));
  }

  // BEFORE: plain semantic top-1 vs ground truth.
  // AFTER: same, but any top candidate failing the code gate is skipped (simulated only).
  let beforeCorrect = 0;
  let afterCorrect = 0;
  let overBefore = 0;
  let overAfter = 0;
  let blocked = 0;
  const reasonSplit = {};
  const legitBlocked = [];
  const falsePositives = [];

  reviewed.forEach((c, i) => {
    const res = semanticStore.retrieve(vecs[i], matrix, 5);
    const expB = bucket(c.expected_complexity_code, c.expected_status);
    const itemCodes = policy.extractCodeTokens(`${c.title} ${c.description || ''}`);
    const topBefore = res.matches[0] || null;
    const beforeB = topBefore ? bucket(cxByCode[topBefore.kbCode] || null,
      (cxByCode[topBefore.kbCode] || null) === 'L0' ? 'NON_FIRMWARE' : 'CLASSIFIED') : 'none';
    if (beforeB === expB) beforeCorrect++;
    else if (topBefore) overBefore++;

    let topAfter = null;
    for (const m of res.matches) {
      const g = policy.checkCodeAgreement(itemCodes, policy.extractCodeTokens(titleByCode[m.kbCode] || ''));
      if (g.pass) { topAfter = m; break; }
      blocked++;
      g.reasons.forEach((r) => { reasonSplit[r] = (reasonSplit[r] || 0) + 1; });
      const mLevel = cxByCode[m.kbCode] || null;
      const mB = bucket(mLevel, mLevel === 'L0' ? 'NON_FIRMWARE' : 'CLASSIFIED');
      if (mB === expB) legitBlocked.push(`${c.id} blocked ${m.kbCode} (was correct) [${g.reasons.join(',')}]`);
    }
    const afterB = topAfter ? bucket(cxByCode[topAfter.kbCode] || null,
      (cxByCode[topAfter.kbCode] || null) === 'L0' ? 'NON_FIRMWARE' : 'CLASSIFIED') : 'none';
    if (afterB === expB) afterCorrect++;
    else if (topAfter) overAfter++;
  });

  // False positives: gated-out candidates that carried the right level anyway are
  // exactly legitBlocked; cases where the gate changed nothing need no action.
  falsePositives.push(...legitBlocked);

  console.log('Semantic code-gate ablation (simulation only — no verdicts touched)');
  console.log(`Reviewed cases: ${reviewed.length} | KB rows: ${matrix.rowCount}`);
  console.log(`BEFORE: top-1 correct=${beforeCorrect} over-matches=${overBefore}`);
  console.log(`AFTER:  top-1 correct=${afterCorrect} over-matches=${overAfter}`);
  console.log(`Blocked candidates: ${blocked} ${JSON.stringify(reasonSplit)}`);
  console.log(`Legitimate matches blocked (harm): ${legitBlocked.length}`);
  legitBlocked.forEach((l) => console.log('  HARM: ' + l));
  console.log(`False positives: ${falsePositives.length}`);

  console.log('\nCode probes (tests/evaluation/semantic-code-probes.json):');
  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'semantic-code-probes.json'), 'utf8')).probes;
  const pairs = [];
  for (const p of probes) pairs.push(p.a, p.b);
  const pvecs = await embedder.embed(pairs);
  let probeFails = 0;
  probes.forEach((p, i) => {
    const va = pvecs[i * 2];
    const vb = pvecs[i * 2 + 1];
    const sim = dot(va, vb);
    const gAB = policy.checkCodeAgreement(policy.extractCodeTokens(p.a), policy.extractCodeTokens(p.b));
    const gBA = policy.checkCodeAgreement(policy.extractCodeTokens(p.b), policy.extractCodeTokens(p.a));
    let verdict = 'PASS';
    if (p.expect === 'reject' && gAB.pass && gBA.pass) { verdict = 'FAIL (no gate fires either direction)'; probeFails++; }
    if (p.expect === 'allow' && (!gAB.pass || !gBA.pass)) { verdict = 'FAIL (legitimate pair blocked)'; probeFails++; }
    if (p.expect === 'monitor' && sim >= (p.max_score || 0.9)) { verdict = 'FAIL (similarity above alert line)'; probeFails++; }
    console.log(`${verdict} ${p.id}: sim=${sim.toFixed(3)} gateAB=${gAB.pass ? 'pass' : 'REJECT[' + gAB.reasons.join(',') + ']'} gateBA=${gBA.pass ? 'pass' : 'REJECT[' + gBA.reasons.join(',') + ']'}`);
  });
  console.log(`PROBES: ${probes.length - probeFails}/${probes.length} pass`);

  await embedder.shutdown();
  process.exit(probeFails === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
