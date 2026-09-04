-- Point 3: structured context on kb_items.
-- Learned rows keep the machine model/version they were reviewed in;
-- SEED/manual rows stay NULL (= matches any model, no bonus/penalty).
ALTER TABLE IF EXISTS kb_items
  ADD COLUMN IF NOT EXISTS machine_model_id INT REFERENCES machine_model(id),
  ADD COLUMN IF NOT EXISTS machine_model_version_id INT REFERENCES machine_model_ver(id);

CREATE INDEX IF NOT EXISTS idx_kb_items_model
  ON kb_items (machine_model_id, machine_model_version_id) WHERE is_active = TRUE;
