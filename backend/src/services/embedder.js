const path = require('path');
const { Worker } = require('worker_threads');

const DEFAULT_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS) || 30000;

let worker = null;
let seq = 0;
const pending = new Map();

const spawn = () => {
  worker = new Worker(path.join(__dirname, 'embedWorker.js'));
  worker.on('message', (msg) => {
    const entry = msg && msg.id != null ? pending.get(msg.id) : null;
    if (!entry) return;
    pending.delete(msg.id);
    clearTimeout(entry.timer);
    entry.resolve(msg);
  });
  worker.on('error', (err) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: String((err && err.message) || err) });
    }
    pending.clear();
  });
  worker.on('exit', () => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: 'embed worker exited' });
    }
    pending.clear();
    worker = null;
  });
  return worker;
};

const call = (message, timeoutMs) => new Promise((resolve) => {
  if (!worker) spawn();
  const id = ++seq;
  const timer = setTimeout(() => {
    pending.delete(id);
    resolve({ id, ok: false, error: `embed timeout after ${timeoutMs}ms` });
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  pending.set(id, { resolve, timer });
  worker.postMessage({ ...message, id });
});

const embed = async (texts, { timeoutMs } = {}) => {
  const list = Array.isArray(texts) ? texts : [texts];
  if (!list.length || list.some((t) => typeof t !== 'string')) return null;
  const timeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : timeoutMs;
  try {
    const res = await call({ type: 'embed', texts: list }, timeout);
    if (!res || !res.ok || !Array.isArray(res.vectors)) return null;
    return res.vectors;
  } catch {
    return null;
  }
};

const status = async (timeoutMs = 5000) => {
  try {
    const res = await call({ type: 'ping' }, timeoutMs);
    return { alive: true, ready: !!(res && res.ready) };
  } catch {
    return { alive: false, ready: false };
  }
};

const shutdown = async () => {
  if (!worker) return;
  const w = worker;
  worker = null;
  await w.terminate();
};

module.exports = { embed, status, shutdown, DEFAULT_TIMEOUT_MS };
