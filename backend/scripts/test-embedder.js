const assert = require('assert');
const embedder = require('../src/services/embedder');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };

const cosine = (a, b) => {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
};

(async () => {
  const t0 = Date.now();
  const vecs = await embedder.embed([
    'Emergency stop button',
    'Emergency stop button',
    'E-stop pushbutton for panel',
    'Quantum flux deflector calibration',
  ]);
  const firstMs = Date.now() - t0;
  ok(Array.isArray(vecs) && vecs.length === 4, 'returns one vector per input');
  ok(vecs.every((v) => v.length === 384), '384 dimensions (bge-small)');
  console.log(`first-call latency (incl. model load): ${firstMs} ms`);

  const [a, b, c, d] = vecs;
  const selfSim = cosine(a, b);
  ok(selfSim > 0.999, `identical text self-similarity ~1.0 (got ${selfSim.toFixed(4)})`);
  const related = cosine(a, c);
  const unrelated = cosine(a, d);
  console.log(`similarity: related=${related.toFixed(3)} unrelated=${unrelated.toFixed(3)}`);
  ok(related > unrelated, 'related pair outranks unrelated pair');

  const t1 = Date.now();
  const warm = await embedder.embed(['Mergepoint']);
  const warmMs = Date.now() - t1;
  ok(warm && warm[0].length === 384, 'warm call returns vectors');
  console.log(`warm-call latency: ${warmMs} ms`);

  const st = await embedder.status();
  ok(st.alive === true && st.ready === true, 'worker alive and model ready');

  await embedder.shutdown();
  const timedOut = await embedder.embed(['anything at all'], { timeoutMs: 50 });
  ok(timedOut === null, 'timeout path resolves null while model reloads (never throws)');
  const afterTimeout = await embedder.embed(['still working']);
  ok(afterTimeout && afterTimeout[0].length === 384, 'worker usable after a timeout');

  await embedder.shutdown();
  console.log(`test-embedder: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
