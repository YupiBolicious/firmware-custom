const fs = require('fs');
const path = require('path');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');

(async () => {
  const matrix = await semanticStore.getMatrix();
  console.log(`MATRIX: rows=${matrix.rowCount} key=${matrix.key}`);

  const kbCache = require('../src/services/kbCache');
  const prepared = await kbCache.getPreparedKb();
  const texts = prepared.rows.map((r) => `${r.title || ''} ${r.description || ''} ${r.keywords || ''}`.trim());
  const selfVecs = await embedder.embed(texts);
  let selfTop1 = 0;
  const selfFails = [];
  selfVecs.forEach((v, i) => {
    const res = semanticStore.retrieve(v, matrix, 1);
    if (res.matches.length && res.matches[0].kbId === prepared.rows[i].id) selfTop1++;
    else selfFails.push(prepared.rows[i].kb_code);
  });
  console.log(`SELF_RETRIEVAL: ${selfTop1}/${prepared.rows.length} top-1` +
    (selfFails.length ? ` FAILS: ${selfFails.join(',')}` : ''));

  // Agreement analysis over business eval cases with ground truth.
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const reviewed = set.cases.filter((c) => c.review_status === 'REVIEWED');
  const allTexts = reviewed.map((c) => `${c.title} ${c.description || ''}`.trim());
  const allVecs = await embedder.embed(allTexts);

  // Need level per kb row: pull from DB via kbCache? prepared rows lack cx code; map via fresh query.
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
  let agree = 0, semCorrect = 0, lexCorrect = 0, semOvermatch = 0, scored = 0;
  const margins = [];
  const disagreements = [];
  reviewed.forEach((c, i) => {
    const res = semanticStore.retrieve(allVecs[i], matrix, 3);
    if (!res.matches.length) return;
    scored++;
    margins.push(res.margin);
    const semCode = cxByCode[res.matches[0].kbCode] || null;
    const semStatus = semCode ? (semCode === 'L0' ? 'NON_FIRMWARE' : 'CLASSIFIED') : null;
    const lexCode = c.prediction.complexity_code || null;
    const lexStatus = c.prediction.status;
    const expB = bucket(c.expected_complexity_code, c.expected_status);
    const semB = bucket(semCode, semStatus);
    const lexB = bucket(lexCode, lexStatus);
    if (semB === lexB) agree++;
    if (semB === expB) semCorrect++;
    if (lexB === expB) lexCorrect++;
    if (semB !== expB && lexB === expB) {
      semOvermatch++;
      disagreements.push(`${c.id} "${c.title}": lexical=${lexB}✓ semantic=${semB} (top ${res.matches[0].kbCode}@${res.matches[0].score.toFixed(2)} margin=${res.margin.toFixed(2)})`);
    }
  });
  margins.sort((a, b) => a - b);
  console.log(`AGREEMENT: lexical-vs-semantic ${agree}/${scored}`);
  console.log(`SEMANTIC_ACCURACY: ${semCorrect}/${scored} | LEXICAL_ACCURACY: ${lexCorrect}/${scored}`);
  console.log(`SEMANTIC_OVERMATCH (lex right, sem wrong): ${semOvermatch}`);
  console.log(`MARGINS: min=${margins[0].toFixed(2)} p50=${margins[Math.floor(margins.length / 2)].toFixed(2)} max=${margins[margins.length - 1].toFixed(2)}`);
  console.log('DISAGREEMENTS (semantic wrong, lexical right):');
  disagreements.forEach((d) => console.log('  ' + d));

  // False-friend probes: lookalikes that must never match.
  const friends = [
    ['Merge Point', 'setpoint-change probe'],
    ['AX-200 controller', 'AX-201 controller'],
    ['glass panel', 'Glassdoor Panel'],
  ];
  const fvecs = await embedder.embed(friends.map((f) => f[0]));
  const gvecs = await embedder.embed(['Change inflow setpoint', 'AX-201 controller', 'Add Glassdoor Panel']);
  fvecs.forEach((v, i) => {
    let dot = 0;
    for (let d = 0; d < v.length; d++) dot += v[d] * gvecs[i][d];
    console.log(`FALSE_FRIEND "${friends[i][0]}" vs "${['Change inflow setpoint', 'AX-201 controller', 'Add Glassdoor Panel'][i]}": ${dot.toFixed(3)} ${dot >= 0.6 ? '(WOULD-AUTO — DANGER)' : '(below auto line)'}`);
  });

  await embedder.shutdown();
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
