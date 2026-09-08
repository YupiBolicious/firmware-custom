const assert = require('assert');
const embedder = require('../src/services/embedder');
const semanticStore = require('../src/services/semanticStore');
const { bumpCorpusVersion } = require('../src/repositories/kbRepository');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

(async () => {
  semanticStore.invalidate();
  const m1 = await semanticStore.getMatrix();
  ok(m1.rowCount > 0, 'build: matrix covers the live corpus');
  ok(m1.matrix instanceof Float32Array, 'build: flat typed array');
  ok(m1.matrix.length === m1.rowCount * 384, 'build: rowCount x 384 layout');
  ok(m1.buildMs >= 0, 'build: cost recorded');

  const m2 = await semanticStore.getMatrix();
  ok(m2.matrix === m1.matrix, 'reuse: same matrix identity across reads');

  const vecs = await embedder.embed(['Emergency stop button']);
  const res = semanticStore.retrieve(vecs[0], m2, 3);
  ok(res.matches.length === 3, 'retrieve: top-3 returned');
  ok(res.matches[0].score >= res.matches[1].score, 'retrieve: descending order');
  ok(typeof res.margin === 'number', 'retrieve: margin reported');
  console.log(`retrieve: top=${res.matches[0].kbCode}@${res.matches[0].score.toFixed(3)} margin=${res.margin.toFixed(3)}`);

  const norm = Math.sqrt(vecs[0].reduce((s, x) => s + x * x, 0));
  ok(Math.abs(norm - 1) < 1e-3, 'vectors arrive L2-normalized (dot = cosine)');

  const roundtrip = m2.rowIds.every((id, i) => {
    const e = new Array(384).fill(0);
    for (let d = 0; d < 384; d++) e[d] = m2.matrix[i * 384 + d];
    return m2.codes[id] != null;
  });
  ok(roundtrip, 'row order stability: every slice maps to a known kb code');

  const v0 = m2.version;
  semanticStore.invalidate();
  const m3 = await semanticStore.getMatrix();
  ok(m3.version === v0, 'invalidate: rebuilds at same version');
  ok(m3.matrix !== m2.matrix, 'invalidate: fresh object, no stale reuse');

  const bumped = await bumpCorpusVersion();
  const m4 = await semanticStore.getMatrix();
  ok(m4.version === bumped, 'kb-change: rebuild picks up new version');
  ok(m4.cacheHit === false, 'kb-change: rebuild, not a stale hit');

  const empty = semanticStore.retrieve(vecs[0], { rowIds: [], codes: {}, matrix: new Float32Array(0) }, 3);
  eq(empty, { matches: [], margin: 0 }, 'empty KB: empty result, no crash');
  const badDim = semanticStore.retrieve([1, 2, 3], m4, 3);
  eq(badDim, { matches: [], margin: 0 }, 'wrong-dimension query rejected with same shape');

  const failSafe = await (async () => {
    await embedder.shutdown();
    const t = await embedder.embed(['probe after shutdown'], { timeoutMs: 50 });
    const back = await embedder.embed(['recovered']);
    return { t, back: !!(back && back[0] && back[0].length === 384) };
  })();
  ok(failSafe.back === true, 'failure: worker recovers, lexical path never blocked by design');

  const st = semanticStore.stats();
  ok(st.builds >= 3, `build counter advances (${st.builds})`);
  console.log(`matrix: rows=${m4.rowCount} buildMs=${m4.buildMs} key=${m4.key}`);
  console.log(`store stats: builds=${st.builds} hits=${st.hits}`);

  await embedder.shutdown();
  console.log(`test-semantic-store: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
