const fs = require('fs');
const path = require('path');
const classificationService = require('../src/services/classificationService');

const SNAP_PATH = path.join(__dirname, '..', 'tests', 'evaluation', 'matcher-parity-snapshot.json');
const MODE = process.argv.includes('--capture') ? 'capture' : 'verify';

const stable = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  const probes = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'probe-set.json'), 'utf8')).probes;
  const set = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'tests', 'evaluation', 'business-eval-set.json'), 'utf8'));

  const cases = [];
  probes.forEach((p) => cases.push({
    id: `probe-${p.id}`, title: p.title, description: p.desc || '',
    quantity: 1, machine_model_id: 1, machine_model_version_id: 1,
  }));
  set.cases.forEach((c) => cases.push({
    id: c.id, title: c.title, description: c.description || '',
    quantity: c.quantity || 1,
    machine_model_id: c.machine_model_id ?? null,
    machine_model_version_id: c.machine_model_version_id ?? null,
  }));
  cases.push(
    { id: 'edge-empty-title', title: '', description: '', quantity: 1, machine_model_id: null, machine_model_version_id: null },
    { id: 'edge-null-desc', title: 'Emergency stop button', description: null, quantity: 1, machine_model_id: null, machine_model_version_id: null },
    { id: 'edge-no-model', title: 'TEL VAV Controller', description: '', quantity: 1 },
    { id: 'edge-unicode', title: 'Δοκιμή контроллер テスト', description: 'emoji 🔧 test', quantity: 3, machine_model_id: 2, machine_model_version_id: 5 },
    { id: 'edge-long', title: `${'alarm setpoint configuration change '.repeat(40)}`.trim(), description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1 }
  );

  const results = [];
  for (const c of cases) {
    const out = await classificationService.classifyItem({ ...c });
    delete out.id;
    results.push({ id: c.id, input: c, output: stable(out) });
  }

  if (MODE === 'capture') {
    fs.writeFileSync(SNAP_PATH, JSON.stringify({ cases: results.length, results }, null, 2));
    console.log(`PARITY_SNAPSHOT: captured ${results.length} cases -> matcher-parity-snapshot.json`);
    process.exit(0);
  }

  if (!fs.existsSync(SNAP_PATH)) {
    console.error('PARITY_SNAPSHOT: missing snapshot; run with --capture first');
    process.exit(1);
  }
  const snap = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'));
  const byId = new Map(snap.results.map((r) => [r.id, r]));
  let pass = 0;
  const fails = [];
  for (const r of results) {
    const base = byId.get(r.id);
    if (!base) { fails.push(`${r.id}: missing from snapshot`); continue; }
    if (JSON.stringify(base.output) === JSON.stringify(r.output)) pass++;
    else fails.push(`${r.id}: OUTPUT DIFFERS`);
  }
  if (byId.size !== results.length) fails.push(`case count differs: snapshot=${byId.size} current=${results.length}`);
  console.log(`PARITY: pass=${pass} fail=${fails.length} total=${results.length}`);
  fails.slice(0, 10).forEach((f) => console.log('  FAIL: ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
