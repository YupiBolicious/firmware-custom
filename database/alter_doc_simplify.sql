-- Simplify documentation estimation: the tier value (8/24/40) IS the doc effort.
-- Rename preserves stored values; the separate per-level doc column is dropped.
ALTER TABLE IF EXISTS verification_levels DROP COLUMN IF EXISTS doc_mh;
ALTER TABLE IF EXISTS verification_levels DROP COLUMN IF EXISTS doc_required;
ALTER TABLE IF EXISTS verification_levels RENAME COLUMN verification_mh TO doc_mh;

ALTER TABLE IF EXISTS item_estimations DROP COLUMN IF EXISTS documentation_mh;
ALTER TABLE IF EXISTS item_estimations RENAME COLUMN verification_mh TO doc_mh;
