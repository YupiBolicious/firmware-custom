-- Drop documentation effort entirely: only verification_mh remains.
ALTER TABLE IF EXISTS verification_levels DROP COLUMN IF EXISTS doc_mh;
ALTER TABLE IF EXISTS item_estimations DROP COLUMN IF EXISTS doc_mh;
