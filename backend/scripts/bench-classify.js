const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();
const { scorePair } = require('../src/services/classificationService');
const classificationRepository = require('../src/repositories/classificationRepository');
const kbCache = require('../src/services/kbCache');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const ROUNDS = 5;

(async () => {
  const gate = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe-set.json'), 'utf8'));
  const cases = gate.probes.map((p) => ({ title: p.title, desc: p.desc || '' }));
  const ctx = { machine_model_id: gate.model_id, machine_model_version_id: gate.version_id };

  const benchOld = { queryMs: 0, scoreMs: 0, pairs: 0 };
  for (let r = 0; r < ROUNDS; r++) {
    for (const c of cases) {
      const tQ = Date.now();
      const rows = await classificationRepository.findAllKbItems();
      benchOld.queryMs += Date.now() - tQ;
      const tS = Date.now();
      for (const k of rows) {
        scorePair(c.title, c.desc, k, ctx);
        benchOld.pairs++;
      }
      benchOld.scoreMs += Date.now() - tS;
    }
  }

  kbCache.invalidate();
  const benchNew = { queryMs: 0, prepMs: 0, scoreMs: 0, pairs: 0, hits: 0 };
  for (let r = 0; r < ROUNDS; r++) {
    for (const c of cases) {
      const tQ = Date.now();
      const prepared = await kbCache.getPreparedKb();
      const elapsed = Date.now() - tQ;
      if (prepared.cacheHit) benchNew.hits++;
      else { benchNew.queryMs += prepared.queryMs; benchNew.prepMs += prepared.prepMs; }
      void elapsed;
      const tS = Date.now();
      for (const k of prepared.rows) {
        scorePair(c.title, c.desc, k, ctx);
        benchNew.pairs++;
      }
      benchNew.scoreMs += Date.now() - tS;
    }
  }

  const kbRows = (await kbCache.getPreparedKb()).rowCount;
  const totalCases = cases.length * ROUNDS;
  console.log(`BENCH cases=${cases.length} rounds=${ROUNDS} kbRows=${kbRows} candidatesPerCase=${kbRows}`);
  console.log(`BEFORE queryMs=${benchOld.queryMs} scoreMs=${benchOld.scoreMs} totalMs=${benchOld.queryMs + benchOld.scoreMs} perCaseMs=${((benchOld.queryMs + benchOld.scoreMs) / totalCases).toFixed(2)}`);
  console.log(`AFTER  queryMs=${benchNew.queryMs} prepMs=${benchNew.prepMs} scoreMs=${benchNew.scoreMs} totalMs=${benchNew.queryMs + benchNew.prepMs + benchNew.scoreMs} cacheHits=${benchNew.hits}/${totalCases} perCaseMs=${((benchNew.queryMs + benchNew.prepMs + benchNew.scoreMs) / totalCases).toFixed(2)}`);
  const before = benchOld.queryMs + benchOld.scoreMs;
  const after = benchNew.queryMs + benchNew.prepMs + benchNew.scoreMs;
  console.log(`SPEEDUP: ${before === 0 && after === 0 ? 'below timer resolution - see pair counts' : (before / Math.max(after, 1)).toFixed(2) + 'x'} (pairs scored: ${benchOld.pairs} both paths)`);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
