-- Restore verification as its own component alongside doc effort.
-- verification_mh carries the tier values 8/24/40; existing rows gain it additively
-- (their stored totals never contained verification).
ALTER TABLE IF EXISTS verification_levels
  ADD COLUMN IF NOT EXISTS verification_mh NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE verification_levels SET verification_mh = 8 WHERE code = 'V1';
UPDATE verification_levels SET verification_mh = 24 WHERE code = 'V2';
UPDATE verification_levels SET verification_mh = 40 WHERE code = 'V3';

-- Corrected tier mapping: V1 serves L1-L2, V2 serves L3-L4, V3 serves L5.
-- (alter_doc_tiers.sql applied the same change but its doc_mh write is stale
--  after alter_doc_drop.sql, so the live migration is applied here.)
UPDATE complexity_verification_map m SET verification_level_id = v.id
FROM verification_levels v
WHERE v.code = 'V1'
  AND m.complexity_level_id = (SELECT id FROM complexity_levels WHERE code = 'L2');

ALTER TABLE IF EXISTS item_estimations
  ADD COLUMN IF NOT EXISTS verification_mh NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Only rows that never carried verification (verification_mh = 0) are backfilled,
-- so re-running this file is a no-op instead of double-adding verification hours.
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
WHERE ie.work_order_item_id = ver_mh.item_id
  AND ie.verification_mh = 0;

-- L2 rows were migrated under the old L2->V2 tier (24 MH); corrected here to
-- L2->V1 (8 MH). Guarded on the stale 24 MH value so re-runs are a no-op.
-- Rows forced to V3 by MISSING readiness carry 40 MH and are left untouched.
UPDATE item_estimations ie
SET verification_mh = 8,
    total_hours = ie.total_hours - 16
FROM complexity_levels cl
WHERE ie.complexity_level_id = cl.id
  AND cl.code = 'L2'
  AND ie.verification_mh = 24;
