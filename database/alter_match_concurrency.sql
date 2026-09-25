-- Concurrency hardening: classification_matches dedupe.
-- Two concurrent analyze() runs on the same item interleave delete+insert on
-- classification_matches (no unique key) and can leave duplicate match rows.
-- Dedupe existing rows (keep lowest id per entity), then enforce uniqueness so
-- createMatch()'s ON CONFLICT DO NOTHING (classificationRepository.js) is the
-- atomic guard instead of the delete-then-insert sequence.

BEGIN;

-- 1) Drop any stale duplicates left by past races
DELETE FROM classification_matches a
USING classification_matches b
WHERE a.id > b.id
  AND a.classification_id = b.classification_id
  AND COALESCE(a.kb_item_id, 0) = COALESCE(b.kb_item_id, 0)
  AND COALESCE(a.rule_id, 0) = COALESCE(b.rule_id, 0);

-- 2) Unique per (classification, kb item or rule entity)
CREATE UNIQUE INDEX IF NOT EXISTS uq_classification_matches_entity
ON classification_matches (classification_id, COALESCE(kb_item_id, 0), COALESCE(rule_id, 0));

COMMIT;