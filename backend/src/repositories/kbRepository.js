const pool = require('../config/db');

// Fetch all KB items
const findAll = async () => {
  const result = await pool.query(
    `SELECT kb.id, kb.kb_code, kb.title, kb.description, kb.keywords,
            kb.fw_related, kb.complexity_level_id, kb.confidence_score,
            kb.source, kb.is_active, kb.created_at, kb.updated_at,
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
  return result.rows[0] || null;
};

const remove = async (id) => {
  const result = await pool.query(`DELETE FROM kb_items WHERE id = $1 RETURNING id`, [id]);
  return result.rows[0] || null;
};

const upsertCoderLearning = async ({
  item_id, title, description, fw_related, complexity_level_id, keywords,
}) => {
  const result = await pool.query(
    `INSERT INTO kb_items
       (kb_code, title, description, keywords, fw_related, complexity_level_id, confidence_score, source, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, 99, 'CODER_REVIEW', TRUE)
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
       updated_at = NOW()
     RETURNING *`,
    [
      `KB-CODER-${item_id}`,
      title,
      description || null,
      keywords || null,
      fw_related,
      complexity_level_id || null,
    ]
  );
  return result.rows[0];
};

module.exports = { findAll, findById, create, update, remove, upsertCoderLearning };