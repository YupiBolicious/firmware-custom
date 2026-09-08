const classificationRepository = require('../repositories/classificationRepository');
const kbRepository = require('../repositories/kbRepository');
const { tokenize, normalize } = require('../utils/tokenPolicy');

let cache = null;
let builds = 0;
let hits = 0;

const prepareRow = (row) => ({
  id: row.id,
  kb_code: row.kb_code,
  title: row.title,
  description: row.description,
  keywords: row.keywords,
  fw_related: row.fw_related,
  complexity_level_id: row.complexity_level_id,
  confidence_score: row.confidence_score,
  machine_model_id: row.machine_model_id,
  machine_model_version_id: row.machine_model_version_id,
  tokens: tokenize(`${row.title} ${row.description || ''} ${row.keywords || ''}`),
  normTitle: normalize(row.title || ''),
});

const prepareRows = (rows) => rows.map(prepareRow);

const getPreparedKb = async (force = false) => {
  const version = await kbRepository.getCorpusVersion();
  if (!force && cache && cache.version === version) {
    hits++;
    return { ...cache, cacheHit: true };
  }
  const tQuery = Date.now();
  const rows = await classificationRepository.findAllKbItems();
  const queryMs = Date.now() - tQuery;
  const tPrep = Date.now();
  const prepared = prepareRows(rows);
  const prepMs = Date.now() - tPrep;
  builds++;
  cache = { version, rows: prepared, rowCount: prepared.length, queryMs, prepMs, builds, hits };
  return { ...cache, cacheHit: false };
};

const invalidate = () => {
  cache = null;
};

const cacheStats = () => ({ builds, hits, cached: cache !== null, version: cache ? cache.version : null });

module.exports = { getPreparedKb, invalidate, prepareRows, prepareRow, cacheStats };
