const pool = require('../config/db');

const getCorpusVersion = async () => {
  const result = await pool.query(`SELECT version FROM kb_corpus_version WHERE id = 1`);
  return result.rows[0] ? result.rows[0].version : 1;
};

const bumpCorpusVersion = async () => {
  const result = await pool.query(
    `UPDATE kb_corpus_version SET version = version + 1, updated_at = NOW() WHERE id = 1 RETURNING version`
  );
  return result.rows[0].version;
};

// Fetch all KB items (paged + filtered; fwRelated: 'ALL'|'true'|'false', complexityLevel: 'ALL'|level id)
const findAll = async ({ page = 1, limit = 15, search = '', fwRelated = 'ALL', complexityLevel = 'ALL' } = {}) => {
  const conds = [];
  const params = [];
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim().replace(/[\\%_]/g, '\\$&')}%`);
    conds.push(`(kb.kb_code ILIKE $${params.length} OR kb.title ILIKE $${params.length}
      OR kb.description ILIKE $${params.length} OR kb.keywords ILIKE $${params.length})`);
  }
  if (fwRelated === 'true' || fwRelated === 'false') {
    params.push(fwRelated === 'true');
    conds.push(`kb.fw_related = $${params.length}`);
  }
  if (Number.isInteger(Number(complexityLevel))) {
    params.push(Number(complexityLevel));
    conds.push(`kb.complexity_level_id = $${params.length}`);
  }
  params.push(limit);
  const limitPh = `$${params.length}`;
  params.push((page - 1) * limit);
  const offsetPh = `$${params.length}`;
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT kb.id, kb.kb_code, kb.title, kb.description, kb.keywords,
            kb.fw_related, kb.complexity_level_id, kb.confidence_score,
            kb.source, kb.is_active, kb.created_at, kb.updated_at,
            kb.machine_model_id, kb.machine_model_version_id,
            cl.code AS complexity_code, cl.name AS complexity_name,
            COUNT(*) OVER ()::int AS total
     FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id
     ${where}
     ORDER BY kb.kb_code
     LIMIT ${limitPh} OFFSET ${offsetPh}`,
    params
  );
  return { items: result.rows, total: result.rows.length ? result.rows[0].total : 0 };
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT kb.id, kb.kb_code, kb.title, kb.description, kb.keywords,
            kb.fw_related, kb.complexity_level_id, kb.confidence_score,
            kb.source, kb.is_active, kb.created_at, kb.updated_at,
            kb.machine_model_id, kb.machine_model_version_id,
            cl.code AS complexity_code, cl.name AS complexity_name
     FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id
     WHERE kb.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const create = async ({
  kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, source, is_active,
}) => {
  const result = await pool.query(
    `INSERT INTO kb_items
       (kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, source, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [kb_code, title, description || null, keywords || null, fw_related, complexity_level_id || null, confidence_score, source || 'MANUAL', is_active !== false]
  );
  if (result.rows[0]) await bumpCorpusVersion();
  return result.rows[0];
};

const UPDATE_FIELDS = ['kb_code', 'title', 'description', 'keywords', 'fw_related', 'complexity_level_id', 'confidence_score', 'is_active'];

const update = async (id, body = {}) => {
  const sets = [];
  const values = [id];
  for (const field of UPDATE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    values.push(body[field] === undefined ? null : body[field]);
    sets.push(`${field} = $${values.length}`);
  }
  if (sets.length === 0) return findById(id);
  sets.push('updated_at = NOW()');
  const result = await pool.query(
    `UPDATE kb_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  if (result.rows[0]) await bumpCorpusVersion();
  return result.rows[0] || null;
};

const remove = async (id) => {
  const result = await pool.query(`DELETE FROM kb_items WHERE id = $1 RETURNING id`, [id]);
  if (result.rows[0]) await bumpCorpusVersion();
  return result.rows[0] || null;
};

const upsertCoderLearning = async ({
  item_id, title, description, fw_related, complexity_level_id, keywords,
}) => {
  const grp = await pool.query(
    `SELECT g.machine_model_id, g.machine_model_version_id
     FROM work_order_items woi
     JOIN work_order_groups g ON g.id = woi.work_order_group_id
     WHERE woi.id = $1`,
    [item_id]
  );
  const modelId = grp.rows[0] ? grp.rows[0].machine_model_id : null;
  const versionId = grp.rows[0] ? grp.rows[0].machine_model_version_id : null;
  const result = await pool.query(
    `INSERT INTO kb_items
       (kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, source, is_active,
        machine_model_id, machine_model_version_id)
     VALUES ($1, $2, $3, $4, $5, $6, 99, 'CODER_REVIEW', TRUE, $7, $8)
      ON CONFLICT (kb_code)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        keywords = EXCLUDED.keywords,
        fw_related = EXCLUDED.fw_related,
        complexity_level_id = EXCLUDED.complexity_level_id,
        confidence_score = EXCLUDED.confidence_score,
        source = EXCLUDED.source,
        is_active = TRUE,
        machine_model_id = EXCLUDED.machine_model_id,
        machine_model_version_id = EXCLUDED.machine_model_version_id,
        updated_at = NOW()
      RETURNING *`,
    [
      `KB-CODER-${item_id}`,
      title,
      description || null,
      keywords || null,
      fw_related,
      complexity_level_id || null,
      modelId,
      versionId,
    ]
  );
  if (result.rows[0]) await bumpCorpusVersion();
  return result.rows[0];
};

module.exports = { findAll, findById, create, update, remove, upsertCoderLearning, getCorpusVersion, bumpCorpusVersion };