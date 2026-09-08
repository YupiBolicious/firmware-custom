const kbCache = require('../services/kbCache');
const embedder = require('../services/embedder');

const DIM = 384;
const MODEL_ID = process.env.EMBED_MODEL || 'Xenova/bge-small-en-v1.5';
const MAX_ROWS = Number(process.env.SEMANTIC_MAX_ROWS) || 100000;

let store = null;
let builds = 0;
let hits = 0;
let rebuildInFlight = null;

const composeText = (row) => `${row.title || ''} ${row.description || ''} ${row.keywords || ''}`.trim();

const rebuild = async (version) => {
  if (rebuildInFlight) return rebuildInFlight;
  rebuildInFlight = (async () => {
    const prepared = await kbCache.getPreparedKb();
    if (prepared.rows.length > MAX_ROWS) {
      throw new Error(`semantic matrix refused: ${prepared.rows.length} rows exceeds cap ${MAX_ROWS}`);
    }
    const t0 = Date.now();
    const vectors = await embedder.embed(prepared.rows.map(composeText));
    if (!vectors || vectors.length !== prepared.rows.length) {
      throw new Error('semantic rebuild: worker returned no vectors');
    }
    const flat = new Float32Array(prepared.rows.length * DIM);
    const rowIds = [];
    prepared.rows.forEach((row, i) => {
      const v = vectors[i];
      if (!Array.isArray(v) || v.length !== DIM || v.some((x) => !Number.isFinite(x))) {
        throw new Error(`semantic rebuild: bad vector for kb id ${row.id}`);
      }
      rowIds.push(row.id);
      flat.set(v, i * DIM);
    });
    builds++;
    store = {
      key: `${version}:${MODEL_ID}`,
      version,
      rowIds,
      codes: Object.fromEntries(prepared.rows.map((r) => [r.id, r.kb_code])),
      matrix: flat,
      rowCount: prepared.rows.length,
      buildMs: Date.now() - t0,
      builds,
      hits,
    };
    rebuildInFlight = null;
    return store;
  })().catch((err) => {
    rebuildInFlight = null;
    throw err;
  });
  return rebuildInFlight;
};

const getMatrix = async () => {
  const prepared = await kbCache.getPreparedKb();
  const key = `${prepared.version}:${MODEL_ID}`;
  if (store && store.key === key) {
    hits++;
    store.hits = hits;
    return { ...store, cacheHit: true };
  }
  const built = await rebuild(prepared.version);
  return { ...built, cacheHit: false };
};

const invalidate = () => {
  store = null;
};

const retrieve = (embedding, matrix, k = 3) => {
  if (!matrix || !matrix.rowIds.length || !Array.isArray(embedding) || embedding.length !== DIM) {
    return { matches: [], margin: 0 };
  }
  const scored = matrix.rowIds.map((id, i) => {
    let dot = 0;
    const off = i * DIM;
    for (let d = 0; d < DIM; d++) dot += embedding[d] * matrix.matrix[off + d];
    return { kbId: id, kbCode: matrix.codes[id], score: dot };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.max(1, k));
  const margin = top.length > 1 ? top[0].score - top[1].score : top.length ? 1 : 0;
  return { matches: top, margin };
};

const stats = () => ({ builds, hits, cached: store !== null, key: store ? store.key : null });

module.exports = { getMatrix, invalidate, retrieve, stats, DIM, MODEL_ID, MAX_ROWS };
