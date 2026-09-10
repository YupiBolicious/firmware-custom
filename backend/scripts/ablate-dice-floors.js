const fs = require('fs');
const path = require('path');
const classificationService = require('../src/services/classificationService');

const FLOORS = [0, 0.2, 0.3, 0.4, 0.5];

(async () => {
  const snap = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'matcher-parity-snapshot.json'), 'utf8'));
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));
  const reviewed = new Map(set.cases
    .filter((c) => c.review_status === 'REVIEWED')
    .map((c) => [c.id.replace(/^BIZ-/, 'biz-'), c]));
  void reviewed;

  const byId = new Map();
  for (const c of set.cases) {
    if (c.review_status === 'REVIEWED') {
      byId.set(c.id, {
        expectedCode: c.expected_complexity_code || (c.expected_status === 'NON_FIRMWARE' ? 'L0' : null),
        expectedStatus: c.expected_status || null,
      });
    }
  }
  const { Pool } = require('pg');
  require('dotenv').config();
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const lvRows = await pool.query(`SELECT id, code FROM complexity_levels`);
  await pool.end();
  const codeOf = (id) => {
    const row = lvRows.rows.find((r) => r.id === id);
    return row ? row.code : null;
  };

  for (const floor of FLOORS) {
    process.env.LEXICAL_DICE_MIN_JACCARD = String(floor);
    const methods = {};
    let autoCorrect = 0;
    let autoWrong = 0;
    let reviewCount = 0;
    const moved = [];
    for (const r of snap.results) {
      const out = await classificationService.classifyItem({ ...r.input });
      methods[out.classification_method] = (methods[out.classification_method] || 0) + 1;
      const exp = byId.get(r.id);
      if (exp && exp.expectedCode) {
        const predCode = out.complexity_level_id
          ? codeOf(out.complexity_level_id) : (out.status === 'NON_FIRMWARE' ? 'L0' : null);
        const auto = out.status === 'CLASSIFIED' || out.status === 'NON_FIRMWARE';
        if (auto) {
          if (predCode === exp.expectedCode && (!exp.expectedStatus || exp.expectedStatus === out.status)) autoCorrect++;
          else { autoWrong++; moved.push(`${r.id}: ${out.classification_method} ${predCode || 'none'}/${out.status} (exp ${exp.expectedCode}/${exp.expectedStatus || 'any'})`); }
        } else reviewCount++;
      } else if (out.status === 'CODER_REVIEW') {
        reviewCount++;
      } else {
        autoCorrect++;
      }
    }
    console.log(`floor=${floor.toFixed(1)} methods=${JSON.stringify(methods)} autoCorrect=${autoCorrect} autoWrong=${autoWrong} review=${reviewCount}`);
    if (floor > 0 && moved.length) {
      console.log(`  auto-wrong at floor ${floor.toFixed(1)}:`);
      moved.slice(0, 15).forEach((m) => console.log('   - ' + m));
      if (moved.length > 15) console.log(`   ... and ${moved.length - 15} more`);
    }
  }

  delete process.env.LEXICAL_DICE_MIN_JACCARD;
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
