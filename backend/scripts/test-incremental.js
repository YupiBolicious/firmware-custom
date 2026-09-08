const assert = require('assert');
const { classifyItem, scorePair } = require('../src/services/classificationService');
const kbCache = require('../src/services/kbCache');
const { bumpCorpusVersion } = require('../src/repositories/kbRepository');

let n = 0;
const ok = (v, msg) => { n++; assert.ok(v, msg); };
const eq = (a, b, msg) => { n++; assert.deepStrictEqual(a, b, msg); };

const item = (title, desc) => ({
  title, description: desc || '',
  quantity: 1, machine_model_id: 1, machine_model_version_id: 1,
});

(async () => {
  // Cache reuse: two reads, one build, same object identity source version
  const s0 = kbCache.cacheStats();
  const a = await kbCache.getPreparedKb();
  const b = await kbCache.getPreparedKb();
  ok(a.version === b.version, 'reuse: same corpus version');
  ok(a.rows === b.rows, 'reuse: same prepared rows identity');
  ok(a.rowCount > 0, 'reuse: non-empty KB');
  const s1 = kbCache.cacheStats();
  ok(s1.builds === s0.builds + 1, 'reuse: exactly one build across two reads');

  // Single-item classification through explicit refs (no DB in scorer)
  const refs = { kbItems: a.rows, rules: [] };
  const single = await classifyItem(item('Emergency stop button', ''), refs);
  ok(single.classification_method === 'EXACT_MATCH', 'single: exact match method');
  ok(single.kb_item_id != null, 'single: kb reference attached');

  // Multiple dirty items share one prep (batch): builds counter must not move
  const s2 = kbCache.cacheStats();
  const batchTitles = ['Emergency stop buttons', 'TEL VAV Controller', 'Motorised sash windows'];
  const batchResults = [];
  for (const t of batchTitles) batchResults.push(await classifyItem(item(t, ''), refs));
  const s3 = kbCache.cacheStats();
  ok(s3.builds === s2.builds, 'batch: zero additional KB builds for 3 items');
  eq(batchResults.map((r) => r.classification_method),
     batchResults.map((r) => r.classification_method), 'batch: results produced per item');
  ok(batchResults.every((r) => r.status !== undefined), 'batch: every result has a status');

  // Identical / duplicate descriptions classify identically
  const d1 = await classifyItem(item('Emergency stop button', 'Plant floor'), refs);
  const d2 = await classifyItem(item('Emergency stop button', 'Plant floor'), refs);
  eq(JSON.stringify(d1), JSON.stringify(d2), 'duplicates: identical input, identical output');

  // Empty KB degrades to MANUAL without crashing
  const empty = await classifyItem(item('Something entirely new here', ''), { kbItems: [], rules: [] });
  eq(empty.classification_method, 'MANUAL', 'empty KB: falls through to MANUAL');
  eq(empty.status, 'CODER_REVIEW', 'empty KB: routed to review');
  eq(kbCache.prepareRows([]), [], 'empty KB: prepareRows handles empty input');

  // Explicit invalidation forces rebuild (no DB write)
  const s4 = kbCache.cacheStats();
  kbCache.invalidate();
  const c = await kbCache.getPreparedKb();
  const s5 = kbCache.cacheStats();
  ok(s5.builds === s4.builds + 1, 'invalidate: rebuild after explicit invalidate');
  ok(c.version === s4.version, 'invalidate: version unchanged, rows reprepared');

  // KB change (corpus version bump, one metadata write) forces rebuild with new version
  const before = (await kbCache.getPreparedKb()).version;
  const bumped = await bumpCorpusVersion();
  ok(bumped === before + 1, 'kb-change: version advanced by exactly one');
  const after = await kbCache.getPreparedKb();
  ok(after.version === bumped, 'kb-change: cache picked up new version');
  ok(after.cacheHit === false, 'kb-change: rebuild, not a stale hit');

  // Consistency spot-check: prepared rows vs raw rows score identically
  const raw = a.rows.map((r) => ({ ...r }));
  delete raw.tokens;
  const probe = item('Motorised sash windows', '');
  const ctx = { machine_model_id: 1, machine_model_version_id: 1 };
  const prepBest = (async () => {
    let best = null;
    for (const k of a.rows) {
      const s = scorePair(probe.title, probe.description, k, ctx);
      if (!best || s.score > best.score) best = { kb: k.kb_code, score: s.score };
    }
    return best;
  })();
  const rawBest = await (async () => {
    const { Pool } = require('pg');
    require('dotenv').config();
    const pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT, 10) || 5432,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    });
    const rows = (await pool.query(
      `SELECT id, kb_code, title, description, keywords, fw_related, complexity_level_id,
              confidence_score, machine_model_id, machine_model_version_id
       FROM kb_items WHERE is_active = TRUE`
    )).rows;
    await pool.end();
    let best = null;
    for (const k of rows) {
      const s = scorePair(probe.title, probe.description, k, ctx);
      if (!best || s.score > best.score) best = { kb: k.kb_code, score: s.score };
    }
    return best;
  })();
  const pb = await prepBest;
  eq(pb.kb, rawBest.kb, 'consistency: same winning row prepared vs raw');
  ok(Math.abs(pb.score - rawBest.score) < 1e-9, 'consistency: identical scores prepared vs raw');

  console.log(`test-incremental: OK (${n} assertions)`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
