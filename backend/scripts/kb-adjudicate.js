const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const { bumpCorpusVersion } = require('../src/repositories/kbRepository');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const apply = process.argv.includes('--apply');
const fileArg = process.argv.find((a) => a.startsWith('--decisions='));
const decisionsPath = fileArg
  ? path.resolve(fileArg.slice('--decisions='.length))
  : path.join(__dirname, 'kb-adjudications.json');

(async () => {
  if (!fs.existsSync(decisionsPath)) {
    console.error(`Missing decisions file: ${decisionsPath}`);
    console.error('Copy kb-adjudications.template.json to kb-adjudications.json and fill the verdicts first.');
    process.exit(1);
  }
  const { decisions } = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
  const levels = (await pool.query(`SELECT id, code FROM complexity_levels`)).rows;
  let appliedCount = 0;

  for (const d of decisions) {
    if (!d.complexity_code || d.fw_related === null || !d.canonical_kb_code) {
      console.log(`SKIP "${d.title}": verdict incomplete`);
      continue;
    }
    const level = levels.find((l) => l.code === d.complexity_code);
    if (!level) throw new Error(`Unknown complexity code: ${d.complexity_code}`);
    if ((d.complexity_code === 'L0') !== (d.fw_related === false)) {
      throw new Error(`Inconsistent verdict for "${d.title}": L0 requires fw_related=false and vice versa`);
    }
    const canon = (await pool.query(`SELECT kb_code, is_active FROM kb_items WHERE kb_code = $1`, [d.canonical_kb_code])).rows[0];
    if (!canon) throw new Error(`Canonical row missing: ${d.canonical_kb_code}`);
    if (!canon.is_active) throw new Error(`Canonical row inactive: ${d.canonical_kb_code}`);
    if ((d.retire_kb_codes || []).includes(d.canonical_kb_code)) {
      throw new Error(`Row cannot be canonical and retired: ${d.canonical_kb_code}`);
    }

    console.log(`${apply ? 'APPLY' : 'DRYRUN'} "${d.title}": canonical=${d.canonical_kb_code} -> ${d.complexity_code} fw=${d.fw_related} conf=${d.confidence}; retire=[${(d.retire_kb_codes || []).join(', ')}]`);
    if (!apply) continue;
    appliedCount++;

    await pool.query(
      `UPDATE kb_items SET fw_related = $2, complexity_level_id = $3, confidence_score = $4,
              source = 'ADJUDICATED', is_active = TRUE, updated_at = NOW()
       WHERE kb_code = $1`,
      [d.canonical_kb_code, d.fw_related, d.complexity_code === 'L0' ? null : level.id, d.confidence || 95]
    );
    for (const code of d.retire_kb_codes || []) {
      const res = await pool.query(`UPDATE kb_items SET is_active = FALSE, updated_at = NOW() WHERE kb_code = $1`, [code]);
      if (res.rowCount === 0) throw new Error(`Retire target missing: ${code}`);
    }
  }
  console.log(apply ? 'APPLIED' : 'DRYRUN_COMPLETE (re-run with --apply to write)');
  if (apply && appliedCount > 0) {
    console.log('KB_CORPUS_VERSION: ' + (await bumpCorpusVersion()));
  }
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
