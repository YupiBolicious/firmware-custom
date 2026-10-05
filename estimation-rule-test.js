const http = require('http');

const BASE = 'http://localhost:5000/api';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path: BASE.replace('http://localhost:5000','') + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': data.length} : {}),
        ...(token ? {'Authorization': Bearer } : {})
      }
    };
    const req = http.request(opts, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => {
        try { resolve({status: res.statusCode, body: s ? JSON.parse(s) : {}}); }
        catch (e) { resolve({status: res.statusCode, body: s}); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(email, pass) {
  const r = await request('POST', '/auth/login', {email, password: pass});
  if (r.status !== 200 || !r.body.data?.token) throw new Error('login failed');
  return r.body.data.token;
}

function genNum(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.floor(Math.random()*10000);
}

async function main() {
  let token, woId, testUserIds=[], testWoIds=[], testGroupIds=[], testItemIds=[];
  try {
    token = await login('pm@demo.com', 'password123');

    // create test WO
    const woNum = genNum('WO-TEST-EST');
    const groups = [
      { machine_model_id: 1, serial_number: 'SN-TEST-A' },
      { machine_model_id: 1, serial_number: 'SN-TEST-B' }
    ];
    const items = [
      { title: 'Custom Item 1', description: 't1', quantity: 1, documentation_readiness: 'READY' },
      { title: 'Custom Item 2', description: 't2', quantity: 2, documentation_readiness: 'READY' },
      { title: 'Custom Item 3', description: 't3', quantity: 5, documentation_readiness: 'READY' }
    ];
    const c = await request('POST', '/work-orders', { wo_number: woNum, customer: 'TEST', groups, items }, token);
    if (c.status !== 201) throw new Error('create failed ' + c.status);
    woId = c.body.data.id;
    testWoIds.push(woId);
    testGroupIds.push(...(c.body.data.groups||[]).map(g=>g.id));
    testItemIds.push(...(c.body.data.items||[]).map(i=>i.id));

    // analyze
    const a = await request('POST', /work-orders//analyze, {}, token);
    if (a.status !== 200) throw new Error('analyze failed ' + a.status);

    // get
    const g = await request('GET', /work-orders/, null, token);
    if (g.status !== 200) throw new Error('get failed ' + g.status);
    const wo = g.body.data;
    const woi = wo.items || [];

    // assertions
    let sumClh = 0, allOk = true;
    for (const it of woi) {
      const est = Number(it.estimated_hours||0);
      const clh = it.estimation_breakdown ? Number(it.estimation_breakdown.other_mh||0) : 0;
      if (Math.abs(est - clh) > 0.001) { allOk=false; console.error('item est!=clh', it.id); }
      sumClh += clh;
      if (it.work_order_group_id !== null) { allOk=false; console.error('wo-level item has group_id', it.id); }
    }
    const total = Number(wo.total_estimated_hours||0);
    if (Math.abs(total - sumClh) > 0.001) { allOk=false; console.error('total mismatch', total, sumClh); }
    if (!allOk) throw new Error('assertions failed');
    console.log('PASS: items', woi.length, 'groups', wo.groups.length, 'total', total, 'sumClh', sumClh);
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  } finally {
    // self-wipe: items, groups, wo
    for (const id of testItemIds.reverse()) {
      try { await request('DELETE', /work-orders//items/, null, token); } catch {}
    }
    for (const gid of testGroupIds.reverse()) {
      try { await request('DELETE', /work-orders//groups/, null, token); } catch {}
    }
    if (woId) {
      try { await request('DELETE', /work-orders/, null, token); } catch {}
    }
    console.log('cleanup done');
  }
}
main();