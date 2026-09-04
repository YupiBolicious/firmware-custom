// Verify identifier validation: submit "ab" -> banner, URL stays /login (no reload).
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DIR = 'C:\\Program Files\\Firmware Custom\\tempLiveTest\\';
const USERDIR = 'C:\\Users\\LUTHIA~1.NAB\\AppData\\Local\\Temp\\opencode\\qa-chrome-ident';

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('WS error')), { once: true });
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
  fs.mkdirSync(USERDIR, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9224', '--user-data-dir=' + USERDIR, 'about:blank',
  ], { stdio: 'ignore' });
  let ws;
  try {
    let dbg = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try { const r = await fetch('http://localhost:9224/json/version'); dbg = await r.json(); break; }
      catch {}
    }
    if (!dbg) throw new Error('DevTools endpoint never came up');
    ws = await wsConnect(dbg.webSocketDebuggerUrl);
    const send = makeSender(ws);
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.enable', {}, sessionId);
    // React-safe fill: native value setter + input event so controlled state updates
    const fill = `const fill=(id,v)=>{const el=document.getElementById(id);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};`;
    await send('Page.navigate', { url: 'http://localhost:5173/login' }, sessionId);
    await sleep(3000);
    await send('Runtime.evaluate', {
      expression: `${fill}fill('login-identifier','ab');fill('login-password','whatever123');document.querySelector('.login-btn').click();`,
    }, sessionId);
    await sleep(2000);
    const state = await send('Runtime.evaluate', {
      expression: `JSON.stringify({url:location.href+location.pathname.includes('x'),path:location.pathname,banner:(document.querySelector('.alert-error')||{}).textContent||null})`,
    }, sessionId);
    console.log('STATE: ' + state.result.value);
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(DIR + '_login-ident.png', Buffer.from(shot.data, 'base64'));
    console.log('saved _login-ident.png');
  } finally {
    try { ws && ws.close(); } catch {}
    try { process.kill(chrome.pid); } catch {}
  }
  process.exit(0);
})().catch((e) => { console.error('CAPTURE ERROR:', e.message); process.exit(1); });
