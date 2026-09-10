const classificationService = require('../src/services/classificationService');
const { scorePair } = require('../src/services/classificationService');
const { tokenize, diceBigram } = require('../src/utils/tokenPolicy');
const kbCache = require('../src/services/kbCache');

(async () => {
  const prepared = await kbCache.getPreparedKb();
  const kb = prepared.rows.find((r) => r.kb_code === 'KB-1006');
  console.log('KB-1006 tokens: ' + JSON.stringify([...kb.tokens]));
  const item = { title: 'alarm bms', description: '', quantity: 1, machine_model_id: 1, machine_model_version_id: 1 };
  console.log('item tokens: ' + JSON.stringify([...tokenize('alarm bms')]));
  const r = scorePair('alarm bms', '', kb, { machine_model_id: 1, machine_model_version_id: 1 });
  console.log(`full=${r.fullScore.toFixed(3)} title=${r.titleScore.toFixed(3)} text=${r.textScore.toFixed(3)} bonus=${r.bonus} final=${r.score.toFixed(3)}`);
  console.log(`dice(title,title)=${diceBigram('alarm bms', kb.title).toFixed(3)}`);
  const verdict = await classificationService.classifyItem(item);
  console.log(`verdict=${verdict.classification_method}/${verdict.status} (kb=${verdict.kb_item_id})`);
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
