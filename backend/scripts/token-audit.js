const { Pool } = require('pg');
require('dotenv').config();
const legacy = require('../src/utils/textUtils');
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
    `SELECT kb_code, title, description, keywords FROM kb_items WHERE is_active = TRUE ORDER BY kb_code`
  )).rows;
  const items = (await pool.query(
    `SELECT woi.item_number, woi.title, woi.description
     FROM work_order_items woi ORDER BY woi.id DESC LIMIT 50`
  )).rows;

  const rescued = new Map();
  for (const row of [...kb.map((k) => ({ t: k.title, d: k.description })), ...items]) {
    const oldKw = new Set(legacy.buildKeywords(row.t, row.d, '').split(',').filter(Boolean));
    const newKw = new Set(policy.buildKeywords(row.t, row.d, '').split(',').filter(Boolean));
    for (const t of newKw) {
      if (!oldKw.has(t)) rescued.set(t, (rescued.get(t) || 0) + 1);
    }
  }
  console.log('RESCUED_TOKENS (in new keywords, absent in old):');
  [...rescued.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .forEach(([t, c]) => console.log(`  ${t}: ${c}`));

  const itemTok = (row) => `${row.title} ${row.description || ''}`;
  const kbTokOld = (k) => legacy.tokenize(`${k.title} ${k.description || ''} ${k.keywords || ''}`);
  const kbTokNew = (k) => policy.tokenize(`${k.title} ${k.description || ''} ${k.keywords || ''}`);

  let up = 0; let down = 0; let same = 0; let crossUp = 0; let crossDown = 0;
  for (const row of items) {
    let bestOld = 0; let bestNew = 0;
    const itOld = legacy.tokenize(itemTok(row));
    const itNew = policy.tokenize(itemTok(row));
    for (const k of kb) {
      bestOld = Math.max(bestOld, jaccard(itOld, kbTokOld(k)));
      bestNew = Math.max(bestNew, jaccard(itNew, kbTokNew(k)));
    }
    const d = bestNew - bestOld;
    if (Math.abs(d) < 1e-9) same++;
    else if (d > 0) { up++; if (bestOld < 0.6 && bestNew >= 0.6) crossUp++; }
    else { down++; if (bestOld >= 0.6 && bestNew < 0.6) crossDown++; }
  }
  console.log(`ITEMS_SCORED: ${items.length} (KB size: ${kb.length})`);
  console.log(`BEST_SCORE_SHIFT: up=${up} down=${down} same=${same}`);
  console.log(`THRESHOLD_CROSS_0.60: newly_above=${crossUp} newly_below=${crossDown}`);
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
