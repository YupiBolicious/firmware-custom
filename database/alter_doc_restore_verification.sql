-- Restore verification as its own component alongside doc effort.
-- verification_mh carries the tier values 8/24/40; existing rows gain it additively
-- (their stored totals never contained verification).
ALTER TABLE IF EXISTS verification_levels
  ADD COLUMN IF NOT EXISTS verification_mh NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE verification_levels SET verification_mh = 8 WHERE code = 'V1';
UPDATE verification_levels SET verification_mh = 24 WHERE code = 'V2';
UPDATE verification_levels SET verification_mh = 40 WHERE code = 'V3';

ALTER TABLE IF EXISTS item_estimations
  ADD COLUMN IF NOT EXISTS verification_mh NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE item_estimations ie
SET verification_mh = ver_mh.verification_mh,
    total_hours = ie.total_hours + ver_mh.verification_mh
FROM (
  SELECT ie2.work_order_item_id AS item_id,
         CASE v.code WHEN 'V1' THEN 8 WHEN 'V2' THEN 24 WHEN 'V3' THEN 40 ELSE 0 END AS verification_mh
  FROM item_estimations ie2
  JOIN complexity_verification_map m ON m.complexity_level_id = ie2.complexity_level_id
  JOIN verification_levels v ON v.id = m.verification_level_id
) AS ver_mh
WHERE ie.work_order_item_id = ver_mh.item_id;
