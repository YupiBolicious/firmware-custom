const { Pool } = require('pg');
require('dotenv').config();
const legacy = require('../src/utils/textUtils');
const { scorePair, jaccard } = require('../src/services/classificationService');
const policy = require('../src/utils/tokenPolicy');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

(async () => {
  const kb = (await pool.query(
    `SELECT kb_code, title, description, keywords, fw_related, complexity_level_id,
            machine_model_id, machine_model_version_id
     FROM kb_items WHERE is_active = TRUE`
  )).rows;
  const items = (await pool.query(
    `SELECT woi.id, woi.item_number, woi.title, woi.description,
            g.machine_model_id, g.machine_model_version_id, g.serial_number,
            mm.model_code, mmv.version_code,
            c.fw_related AS true_fw, c.complexity_level_id AS true_cx
     FROM classifications c
     JOIN work_order_items woi ON woi.id = c.work_order_item_id
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     LEFT JOIN machine_model mm ON mm.id = g.machine_model_id
     LEFT JOIN machine_model_ver mmv ON mmv.id = g.machine_model_version_id
     WHERE c.reviewed_by IS NOT NULL AND c.status IN ('CLASSIFIED', 'NON_FIRMWARE')`
  )).rows;

  const overruled = new Set([67, 69, 66]);
  let unexpected = 0;
  for (const it of items) {
    const soupOld = legacy.tokenize(`${it.title} ${it.description || ''} ${it.model_code || ''} ${it.version_code || ''} ${it.serial_number || ''}`);
    let oldBest = { score: -1, kb: null };
    for (const k of kb) {
      const s = jaccard(soupOld, legacy.tokenize(`${k.title} ${k.description || ''} ${k.keywords || ''}`));
      if (s > oldBest.score) oldBest = { score: s, kb: k };
    }
    const newText = `${it.title} ${it.description || ''}`;
    const ctx = { machine_model_id: it.machine_model_id, machine_model_version_id: it.machine_model_version_id };
    let newBest = { score: -1, kb: null, bonus: 0 };
    for (const k of kb) {
      const r = scorePair(it.title, it.description, k, ctx);
      if (r.score > newBest.score) newBest = { score: r.score, kb: k, bonus: r.bonus };
    }
    const agree = (b) => b.kb && b.kb.fw_related === it.true_fw &&
      ((b.kb.complexity_level_id || null) === (it.true_cx || null));
    const oldTier = oldBest.score >= 0.6 ? 'AUTO' : (oldBest.score >= 0.35 ? 'SIM' : 'REVIEW');
    const newTier = newBest.score >= 0.6 ? 'AUTO' : (newBest.score >= 0.35 ? 'SIM' : 'REVIEW');
    const flip = agree(oldBest) && oldTier === 'AUTO' && !(agree(newBest) && newTier === 'AUTO');
    const expected = overruled.has(it.id);
    if (flip && !expected) unexpected++;
    console.log(`item=${it.id} old=${oldBest.score.toFixed(2)}/${oldTier}/${agree(oldBest) ? 'ok' : 'miss'} new=${newBest.score.toFixed(2)}/bonus=${newBest.bonus >= 0 ? '+' : ''}${newBest.bonus.toFixed(2)}/${newTier}/${agree(newBest) ? 'ok' : 'miss'}${flip ? (expected ? ' EXPECTED-OVERRULED' : ' !!!UNEXPECTED-FLIP') : ''}`);
  }

  const kbMerge = kb.find((k) => k.kb_code === 'KB-CODER-70');
  const soup61 = legacy.tokenize('Mergepoint lt B');
  const oldJ1 = jaccard(soup61, legacy.tokenize(`${kbMerge.title} ${kbMerge.keywords || ''}`));
  const newJ1 = scorePair('Mergepoint', null, kbMerge, { machine_model_id: 1, machine_model_version_id: 1 });
  console.log(`J1_REGRESSION [item61-SN-lt-B vs KB-CODER-70]: old_soup=${oldJ1.toFixed(2)} new_text=${newJ1.textScore.toFixed(2)} new_final=${newJ1.score.toFixed(2)}`);

  console.log(unexpected === 0 ? 'NOFLIP_CHECK: PASS (0 unexpected flips)' : `NOFLIP_CHECK: FAIL (${unexpected} unexpected flips)`);
  await pool.end();
  process.exit(unexpected === 0 ? 0 : 1);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
