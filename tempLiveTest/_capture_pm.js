// Capture authenticated PM dashboard via headless Chrome + raw CDP (no deps).
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = 'C:\\Program Files\\Firmware Custom\\tempLiveTest\\_pm-dash.png';
const USERDIR = 'C:\\Users\\LUTHIA~1.NAB\\AppData\\Local\\Temp\\opencode\\qa-chrome-profile';

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', (e) => reject(new Error('WS error')), { once: true });
  });
}
function makeSender(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    }
  });
  return (method, params, sessionId) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    const payload = { id: mid, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('CDP timeout ' + method)); } }, 20000);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. PM login via backend
  const lr = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'pm@demo', password: 'password123' }),
  });
  const lj = await lr.json();
  if (!lj.data || !lj.data.token) throw new Error('PM login failed: ' + lr.status);
  const token = lj.data.token;
  const userStr = JSON.stringify(lj.data.user).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  console.log('PM login OK, user=' + lj.data.user.email);

  // 2. Launch headless Chrome with remote debugging
  fs.mkdirSync(USERDIR, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9222', '--user-data-dir=' + USERDIR, 'about:blank',
  ], { stdio: 'ignore' });
  let ws;
  try {
    let dbg = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try { const r = await fetch('http://localhost:9222/json/version'); dbg = await r.json(); break; }
      catch {}
    }
    if (!dbg) throw new Error('DevTools endpoint never came up');
    ws = await wsConnect(dbg.webSocketDebuggerUrl);
    const send = makeSender(ws);
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Page.navigate', { url: 'http://localhost:5173/login' }, sessionId);
    await sleep(2500); // land on app origin first so localStorage is available
    await send('Runtime.evaluate', { expression: `localStorage.setItem('token','${token}');localStorage.setItem('user','${userStr}');` }, sessionId);
    await send('Page.navigate', { url: 'http://localhost:5173/' }, sessionId);
    await sleep(5000); // let API data + charts settle
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    await send('Runtime.evaluate', { expression: `window.scrollTo(0, document.body.scrollHeight);` }, sessionId);
    await sleep(1500);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(SHOT.replace('.png', '-bottom.png'), Buffer.from(shot2.data, 'base64'));
    await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('h3')].find(e=>e.textContent.includes('Progress Overview')).scrollIntoView({block:'center'});` }, sessionId);
    await sleep(1200);
    const shot3 = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(SHOT.replace('.png', '-mid.png'), Buffer.from(shot3.data, 'base64'));
    await send('Runtime.evaluate', { expression: `window.scrollTo(0,0);[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Advanced Filters')).click();` }, sessionId);
    await sleep(1500);
    const shot4 = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(SHOT.replace('.png', '-filters.png'), Buffer.from(shot4.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await send('Page.navigate', { url: 'http://localhost:5173/' }, sessionId);
    await sleep(4500);
    const shot5 = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(SHOT.replace('.png', '-mobile.png'), Buffer.from(shot5.data, 'base64'));
    const st = fs.statSync(SHOT);
    const sig = fs.readFileSync(SHOT).subarray(0, 8).toString('hex');
    console.log('SHOT bytes=' + st.size + ' png-sig=' + (sig === '89504e470d0a1a0a'));
  } finally {
    try { ws && ws.close(); } catch {}
    try { process.kill(chrome.pid); } catch {}
  }
  console.log('saved ' + SHOT);
  process.exit(0);
})().catch((e) => { console.error('CAPTURE ERROR:', e.message); process.exit(1); });
