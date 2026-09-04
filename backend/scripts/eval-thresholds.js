const { Pool } = require('pg');
require('dotenv').config();
const policy = require('../src/utils/tokenPolicy');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const jaccard = (a, b) => {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / new Set([...a, ...b]).size;
};

(async () => {
  const kb = (await pool.query(
    `SELECT id, kb_code, title, description, keywords, fw_related, complexity_level_id
     FROM kb_items WHERE is_active = TRUE`
  )).rows.map((k) => ({ ...k, tokens: policy.tokenize(`${k.title} ${k.description || ''} ${k.keywords || ''}`) }));

  const reviewed = (await pool.query(
    `SELECT woi.id, woi.item_number, woi.title, woi.description,
            c.fw_related AS true_fw, c.complexity_level_id AS true_cx
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     WHERE c.reviewed_by IS NOT NULL AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')`
  )).rows;

  console.log(`EVAL_N: ${reviewed.length} coder-reviewed items, KB: ${kb.length}`);
  if (reviewed.length === 0) { await pool.end(); return; }

  const samples = [];
  for (const r of reviewed) {
    const it = policy.tokenize(`${r.title} ${r.description || ''}`);
    let best = null; let bestScore = -1;
    for (const k of kb) {
      if (k.kb_code === `KB-CODER-${r.id}`) continue;
      const s = jaccard(it, k.tokens);
      if (s > bestScore) { bestScore = s; best = k; }
    }
    const agree = best &&
      (best.fw_related === r.true_fw) &&
      ((best.complexity_level_id || null) === (r.true_cx || null));
    samples.push({ score: bestScore, agree: !!agree, item: r.item_number, kb: best ? best.kb_code : null });
  }

  const hist = {};
  for (const s of samples) {
    const b = (Math.floor(s.score * 10) / 10).toFixed(1);
    hist[b] = hist[b] || { n: 0, agree: 0 };
    hist[b].n++; if (s.agree) hist[b].agree++;
  }
  console.log('SCORE_HISTOGRAM (bucket: n, agree, precision):');
  Object.keys(hist).sort().forEach((b) =>
    console.log(`  ${b}: n=${hist[b].n} agree=${hist[b].agree} p=${(hist[b].agree / hist[b].n).toFixed(2)}`));

  console.log('THRESHOLD_SWEEP (exact=T auto-classifies; rest -> review):');
  for (const T of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) {
    const auto = samples.filter((s) => s.score >= T);
    const good = auto.filter((s) => s.agree).length;
    console.log(`  T=${T.toFixed(2)}: coverage=${auto.length}/${samples.length} precision=${auto.length ? (good / auto.length).toFixed(2) : '-'}`);
  }
  console.log('DISAGREEMENTS_AT_0.60 (would-auto-classify-wrong — review these KB rows first):');
  samples.filter((s) => s.score >= 0.6 && !s.agree).slice(0, 15)
    .forEach((s) => console.log(`  ${s.item} -> ${s.kb} (score=${s.score.toFixed(2)})`));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
