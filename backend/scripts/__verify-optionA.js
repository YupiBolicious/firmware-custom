const base = 'http://localhost:5000';
const pool = require('../src/config/db');

async function api(method, path, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { s: r.status, d: j && j.data, raw: j };
}
const D = 0;

(async () => {
  const login = await api('POST', '/api/auth/login', null, { identifier: 'pm@demo.com', password: 'password123' });
  const tok = login.d.token;
  const u = await pool.query('SELECT id FROM users WHERE email = $1', ['pm@demo.com']);
  const uid = u.rows[0].id;
  const m = await pool.query('SELECT id FROM machine_model WHERE is_active = TRUE ORDER BY id LIMIT 1');
  const ts = Date.now();
  const wo_number = 'WO-OA-' + ts;

  const c = await api('POST', '/api/work-orders', tok, {
    wo_number, description: 'optionA', customer: 'QA',
    groups: [{ machine_model_id: m.rows[0].id, serial_number: 'SN-' + ts }],
  });
  if (c.s !== 201) throw new Error('create: ' + c.s + ' ' + JSON.stringify(c.raw));
  const wid = c.d.id;
  console.log('created WO', wid);

  try {
    const g = await pool.query('SELECT id FROM work_order_groups WHERE work_order_id = $1', [wid]);
    for (const q of [1, 3, 2]) {
      const a = await api('POST', '/api/work-orders/' + wid + '/items', tok, {
        title: 'OA item q' + q, description: 'd', quantity: q, work_order_group_id: g.rows[0].id,
      });
      if (a.s !== 201) throw new Error('add item qty=' + q + ': ' + a.s + ' ' + JSON.stringify(a.raw));
    }

    const an = await api('POST', '/api/work-orders/' + wid + '/analyze', tok);
    if (an.s !== 200) throw new Error('analyze: ' + an.s + ' ' + JSON.stringify(an.raw));
    console.log('analyze OK');

    const get = await api('GET', '/api/work-orders/' + wid, tok);
    if (get.s !== 200) throw new Error('get: ' + get.s);
    const det = get.d;

    const checks = [];
    const eq = (name, a, b) => checks.push({ name, ok: Math.abs(Number(a) - Number(b)) < 0.001, a: Number(a), b: Number(b) });

    // 1. analyze summary == GET wo total
    eq('analyze.summary.total == GET wo.total', an.d.summary.total_estimated_hours, det.total_estimated_hours);
    // 2. GET wo total == sum of GET item estimated_hours
    const sumItems = det.items.reduce((s, i) => s + (Number(i.estimated_hours) || 0), 0);
    eq('GET wo.total == sum(GET items.estimated_hours)', det.total_estimated_hours, sumItems);
    // 3. analyze items == GET items, per item
    const byId = new Map(det.items.map(i => [i.id, i]));
    let allMatch = true;
    for (const a of an.d.results || []) {
      const g2 = byId.get(a.id);
      if (!g2 || Number(a.estimated_hours) !== Number(g2.estimated_hours)) allMatch = false;
    }
    checks.push({ name: 'analyze items == GET items (per item)', ok: allMatch, a: 'n/a', b: 'n/a' });

    // 4. THE RULE: estimated_hours == complexity hours + verification_mh (i.e. breakdown.total_hours)
    let ruleOk = true;
    const rows = [];
    for (const i of det.items) {
      const bd = i.estimation_breakdown;
      if (!bd) continue;
      const expect = Number(bd.verification_mh) + Number(bd.other_mh);
      rows.push({ qty: i.quantity, cx: i.complexity_code, est: Number(i.estimated_hours), ver: Number(bd.verification_mh), other: Number(bd.other_mh), storedTotal: Number(bd.total_hours), expect });
      if (Number(i.estimated_hours) !== expect) ruleOk = false;
      if (Number(i.estimated_hours) !== Number(bd.total_hours)) ruleOk = false;
    }
    checks.push({ name: 'estimated_hours == verification_mh + other_mh', ok: ruleOk, a: 'n/a', b: 'n/a' });

    // 5. quantity independence: equal complexity => equal estimated_hours
    const byCx = {};
    for (const i of det.items) {
      const cxi = i.complexity_code || 'null';
      byCx[cxi] = byCx[cxi] || new Set();
      byCx[cxi].add(Number(i.estimated_hours));
    }
    const indep = Object.entries(byCx).every(([k, v]) => v.size <= 1);
    checks.push({ name: 'quantity-independent (same complexity => same hours)', ok: indep, a: JSON.stringify(byCx), b: 'each set size <= 1' });

    console.log('\n--- item detail ---');
    rows.forEach(r => console.log(JSON.stringify(r)));
    console.log('\n--- checks ---');
    let fail = 0;
    for (const c of checks) {
      if (!c.ok) fail++;
      console.log((c.ok ? 'PASS ' : 'FAIL ') + c.name + (c.ok ? '' : '  got=' + c.a + ' want=' + c.b));
    }
    console.log('\nanalyze summary = ' + JSON.stringify(an.d.summary));
    console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILED');
    return fail === 0;
  } finally {
    await pool.query('DELETE FROM audit_trail WHERE entity_id = $1', [wid]).catch(() => {});
    await pool.query('DELETE FROM notifications WHERE entity_id = $1', [wid]).catch(() => {});
    await pool.query('DELETE FROM work_orders WHERE id = $1', [wid]).catch(() => {});
    const left = await pool.query('SELECT COUNT(*)::int AS n FROM work_orders WHERE wo_number = $1', [wo_number]);
    console.log('cleanup rows left: ' + left.rows[0].n);
    await pool.end();
  }
})().then(ok => process.exit(ok ? 0 : 1))
  .catch(e => { console.log('TOP: ' + e.message); process.exit(1); });
