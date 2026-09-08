const { parentPort } = require('worker_threads');

const MODEL_ID = process.env.EMBED_MODEL || 'Xenova/bge-small-en-v1.5';

let extractor = null;
let loading = null;

const loadModel = () => {
  if (extractor) return Promise.resolve(extractor);
  if (!loading) {
    loading = (async () => {
      const { pipeline } = require('@xenova/transformers');
      extractor = await pipeline('feature-extraction', MODEL_ID, { quantized: true });
      const warmup = await extractor(['warmup'], { pooling: 'mean', normalize: true });
      warmup.tolist();
      return extractor;
    })().catch((err) => {
      loading = null;
      extractor = null;
      throw err;
    });
  }
  return loading;
};

if (!parentPort) {
  throw new Error('embedWorker must run as a worker thread');
}

parentPort.on('message', async (msg) => {
  if (!msg || msg.type === 'ping') {
    parentPort.postMessage({ id: msg && msg.id, ok: true, ready: extractor !== null });
    return;
  }
  if (msg.type !== 'embed' || !Array.isArray(msg.texts)) {
    parentPort.postMessage({ id: msg && msg.id, ok: false, error: 'unknown message' });
    return;
  }
  try {
    const pipe = await loadModel();
    const out = await pipe(msg.texts, { pooling: 'mean', normalize: true });
    parentPort.postMessage({ id: msg.id, ok: true, vectors: out.tolist() });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });
  }
});
