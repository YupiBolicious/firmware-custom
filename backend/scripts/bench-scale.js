const fs = require('fs');
const path = require('path');
const { scorePair } = require('../src/services/classificationService');
const kbCache = require('../src/services/kbCache');

(async () => {
  const gate = JSON.parse(fs.readFileSync(path.join(__dirname, 'probe-set.json'), 'utf8'));
  const cases = gate.probes.map((p) => ({ title: p.title, desc: p.desc || '' }));
  const ctx = { machine_model_id: gate.model_id, machine_model_version_id: gate.version_id };
  const base = (await kbCache.getPreparedKb()).rows;

  const scaled = (mult) => {
    const out = [];
    for (let m = 0; m < mult; m++) {
      for (const r of base) {
        out.push(m === 0 ? r : { ...r, id: r.id * 100000 + m, kb_code: `${r.kb_code}#${m}`,
          title: `${r.title} variant ${m}` });
      }
    }
    return out;
  };

  for (const mult of [1, 10, 100, 1000]) {
    const rows = scaled(mult);
    // warm up tokenizer cache effects: single timed pass over all cases
    const t0 = Date.now();
    for (const c of cases) {
      for (const k of rows) scorePair(c.title, c.desc, k, ctx);
    }
    const ms = Date.now() - t0;
    const pairs = cases.length * rows.length;
    console.log(`KB=${rows.length} cases=${cases.length} pairs=${pairs} totalMs=${ms} perPairUs=${((ms * 1000) / pairs).toFixed(1)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
