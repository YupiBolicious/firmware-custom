const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const { scorePair } = require('../src/services/classificationService');
const kbCache = require('../src/services/kbCache');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const parity = process.argv.includes('--parity');

const { tierOf } = require('./scoring-tiers');
const tierOk = (expect, actual) => (expect === 'REVIEW' ? actual !== 'AUTO' : expect === actual);

(async () => {
  const gate = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe-set.json'), 'utf8'));
  const ctx = { machine_model_id: gate.model_id, machine_model_version_id: gate.version_id };
  const prepared = await kbCache.getPreparedKb();
  const rawRows = await pool.query(
    `SELECT id, kb_code, title, description, keywords, fw_related, complexity_level_id,
            confidence_score, machine_model_id, machine_model_version_id
     FROM kb_items WHERE is_active = TRUE`
  );

  let pass = 0; let fail = 0; let parityMismatches = 0;
  for (const p of gate.probes) {
    let best = null;
    for (const k of prepared.rows) {
      const r = scorePair(p.title, p.desc, k, ctx);
      if (!best || r.score > best.score) best = { kb: k.kb_code, score: r.score };
    }
    const tier = tierOf(best.score);
    const problems = [];
    if (!tierOk(p.tier, tier)) problems.push(`tier want=${p.tier} got=${tier}`);
    if (p.kb && best.kb !== p.kb) problems.push(`kb want=${p.kb} got=${best.kb}`);
    if (p.notKb && best.kb === p.notKb) problems.push(`kb must-not=${p.notKb}`);
    if (parity) {
      let bestRaw = null;
      for (const k of rawRows.rows) {
        const r = scorePair(p.title, p.desc, k, ctx);
        if (!bestRaw || r.score > bestRaw.score) bestRaw = { kb: k.kb_code, score: r.score };
      }
      if (bestRaw.kb !== best.kb || Math.abs(bestRaw.score - best.score) > 1e-9) {
        parityMismatches++;
        problems.push(`parity cached=${best.kb}@${best.score.toFixed(4)} raw=${bestRaw.kb}@${bestRaw.score.toFixed(4)}`);
      }
    }
    if (problems.length === 0) { pass++; }
    else { fail++; console.log(`FAIL #${p.id} "${p.title}" -> ${best.kb}@${best.score.toFixed(2)} [${problems.join('; ')}]`); }
  }
  console.log(`GATE: pass=${pass} fail=${fail} total=${gate.probes.length}${parity ? ` parityMismatches=${parityMismatches}` : ''}`);
  await pool.end();
  process.exit(fail === 0 && parityMismatches === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
