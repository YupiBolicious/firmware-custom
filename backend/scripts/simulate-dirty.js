const { Pool } = require('pg');
require('dotenv').config();
const { inputHash } = require('../src/services/classificationService');
const kbCache = require('../src/services/kbCache');
const workOrderRepository = require('../src/repositories/workOrderRepository');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

(async () => {
  const wos = await pool.query(
    `SELECT wo.id, wo.wo_number, COUNT(woi.id)::int AS n
     FROM work_orders wo JOIN work_order_items woi ON woi.work_order_id = wo.id
     GROUP BY wo.id ORDER BY n DESC LIMIT 1`
  );
  if (!wos.rows.length) { console.log('NO_WO_WITH_ITEMS'); await pool.end(); return; }
  const wo = wos.rows[0];
  console.log(`WO: ${wo.wo_number} (id=${wo.id}, items=${wo.n})`);
  const items = await workOrderRepository.findItemsByWorkOrderId(wo.id);
  const version = (await kbCache.getPreparedKb()).version;
  console.log(`corpusVersion=${version}`);

  const flags = items.map((it) => ({
    item_number: it.item_number,
    title: it.title,
    hasVerdict: it.classification_id != null,
    dirty: it.classification_id == null || it.input_hash !== inputHash(it) ||
      Number(it.kb_version) !== Number(version),
  }));
  console.log('BEFORE (as analyze sees them):');
  flags.forEach((f) => console.log(`  ${f.item_number} "${f.title}": verdict=${f.hasVerdict} dirty=${f.dirty}`));

  const victim = items[0];
  const edited = { ...victim, title: `${victim.title} REVISED` };
  console.log(`SIMULATED EDIT (not written): item ${victim.item_number} title + " REVISED"`);
  const after = items.map((it) => {
    const cur = it.id === victim.id ? edited : it;
    return {
      item_number: it.item_number,
      dirty: cur.classification_id == null || it.input_hash !== inputHash(cur) ||
        Number(it.kb_version) !== Number(version),
    };
  });
  after.forEach((f) => console.log(`  ${f.item_number}: dirty=${f.dirty}`));
  const dirtyCount = after.filter((f) => f.dirty).length;
  console.log(`DIRTY_COUNT: ${dirtyCount}/${after.length}`);
  console.log('NOTE: WO-02 items are all MANUAL (human-reviewed); analyze skips reviewed items');
  console.log('entirely, so the dirty flag only governs unreviewed items. NULL stamps = pre-fingerprint');
  console.log('verdicts; the next analyze stamps them and the flag goes quiet.');
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
