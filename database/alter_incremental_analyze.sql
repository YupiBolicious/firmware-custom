-- Incremental analyze support: KB corpus version + per-classification input fingerprint.
-- A classification is reusable only when its input_hash matches the item
-- AND its kb_version matches the current corpus version.
CREATE TABLE IF NOT EXISTS kb_corpus_version (
  id          INT PRIMARY KEY DEFAULT 1,
  version     INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kb_corpus_version_single CHECK (id = 1)
);

INSERT INTO kb_corpus_version (id, version) VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE IF EXISTS classifications
  ADD COLUMN IF NOT EXISTS input_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS kb_version INT;
