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

// Fetch all KB items
const findAll = async () => {
  const result = await pool.query(
    `SELECT kb.id, kb.kb_code, kb.title, kb.description, kb.keywords,
            kb.fw_related, kb.complexity_level_id, kb.confidence_score,
            kb.source, kb.is_active, kb.created_at, kb.updated_at,
            kb.machine_model_id, kb.machine_model_version_id,
            cl.code AS complexity_code, cl.name AS complexity_name
     FROM kb_items kb
     LEFT JOIN complexity_levels cl ON cl.id = kb.complexity_level_id
     ORDER BY kb.kb_code`
  );
  return result.rows;
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

const update = async (id, {
  kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, is_active,
}) => {
  const result = await pool.query(
    `UPDATE kb_items
     SET kb_code = $2,
         title = $3,
         description = $4,
         keywords = $5,
         fw_related = $6,
         complexity_level_id = $7,
         confidence_score = $8,
         is_active = $9,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, is_active]
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