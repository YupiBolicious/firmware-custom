-- Corrected verification model (2026-09-07):
-- V1 serves L1-L2 and provides standard documentation.
-- V2 serves L3-L4 and provides standard documentation.
-- V3 serves L5 and provides no documentation (doc_mh = 0, so no code branch needed).
-- Hour values otherwise untouched; L4 remapped from V3 to V2.
UPDATE verification_levels SET doc_mh = 0 WHERE code = 'V3';

UPDATE complexity_verification_map m SET verification_level_id = v.id
FROM verification_levels v
WHERE v.code = 'V2'
  AND m.complexity_level_id = (SELECT id FROM complexity_levels WHERE code = 'L4');
