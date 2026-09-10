const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const kbCache = require('../src/services/kbCache');
const classificationRepository = require('../src/repositories/classificationRepository');
const { scoreCandidates } = require('../src/services/matcher');
const { normalize } = require('../src/utils/tokenPolicy');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

(async () => {
  const snap = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'matcher-parity-snapshot.json'), 'utf8'));
  const prepared = await kbCache.getPreparedKb();
  const rules = await classificationRepository.findAllRules();
  const lv = await pool.query(`SELECT id, code FROM complexity_levels`);
  await pool.end();
  const codeOf = (id) => {
    const r = lv.rows.find((x) => x.id === id);
    return r ? r.code : null;
  };

  let coverOnly = 0;
  let ruleOnly = 0;
  let bothAgree = 0;
  const disagreements = [];
  let neither = 0;

  for (const c of snap.results) {
    const inp = c.input;
    const text = normalize(`${inp.title || ''} ${inp.description || ''}`);
    const itemCtx = {
      machine_model_id: inp.machine_model_id ?? null,
      machine_model_version_id: inp.machine_model_version_id ?? null,
    };
    const { bestKb, bestKbScore, coverageCount, coveredKb, sharedCount } =
      scoreCandidates(inp.title, inp.description, prepared.rows, itemCtx);
    const coverFires = !!(bestKb && bestKbScore >= 0.35
      && coverageCount === 1 && coveredKb && coveredKb.id === bestKb.id
      && (sharedCount || 0) >= 2);
    const ruleHits = rules.filter((r) => text.includes(normalize(r.keyword_pattern)));
    const rule = ruleHits[0] || null;

    if (coverFires && rule) {
      const coverLevel = coveredKb.fw_related ? codeOf(coveredKb.complexity_level_id) : 'L0';
      const ruleLevel = rule.fw_related ? codeOf(rule.complexity_level_id) : 'L0';
      const coverFw = !!coveredKb.fw_related;
      if (coverFw === !!rule.fw_related && coverLevel === ruleLevel) bothAgree++;
      else disagreements.push(`${c.id}: coverage=${coveredKb.kb_code}(${coverFw ? coverLevel : 'non-FW'}) vs rule=${rule.rule_code}(${rule.fw_related ? ruleLevel : 'non-FW'})`);
    } else if (coverFires) coverOnly++;
    else if (rule) ruleOnly++;
    else neither++;
  }

  console.log(`CASES: ${snap.results.length}`);
  console.log(`coverage-only (auto-claims, no rule rival): ${coverOnly}`);
  console.log(`rule-only (no coverage claim): ${ruleOnly}`);
  console.log(`both fire + agree: ${bothAgree}`);
  console.log(`both fire + DISAGREE: ${disagreements.length}`);
  disagreements.forEach((d) => console.log('  CONFLICT: ' + d));
  console.log(`neither: ${neither}`);
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
