-- Semantic-assist suggestion snapshot for coder review (2026-09-21).
-- assist_* are a snapshot taken at analyze time from the ACTIVE KB row the
-- assist gate resolved, so an inactive/deleted KB row never breaks the queue
-- render or blocks a coder from confirming manually.

ALTER TABLE classifications
  ADD COLUMN IF NOT EXISTS assist_kb_id INT REFERENCES kb_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assist_kb_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assist_match_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS assist_semantic_margin NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS assist_complexity_level_id INT REFERENCES complexity_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assist_fw_related BOOLEAN,
  ADD COLUMN IF NOT EXISTS assist_response VARCHAR(10)
      CHECK (assist_response IN ('ACCEPTED','IGNORED') OR assist_response IS NULL);

CREATE INDEX IF NOT EXISTS idx_classifications_assist
  ON classifications(assist_kb_id) WHERE assist_kb_id IS NOT NULL;