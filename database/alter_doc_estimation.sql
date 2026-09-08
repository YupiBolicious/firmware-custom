-- Documentation-aware estimation: verification levels + per-level doc effort.
-- complexity_levels (L0-L5) is untouched; mapping decides verification tier.
ALTER TABLE IF EXISTS work_order_items
  ADD COLUMN IF NOT EXISTS documentation_readiness VARCHAR(10);

CREATE TABLE IF NOT EXISTS verification_levels (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(10) NOT NULL UNIQUE,
  name              VARCHAR(100) NOT NULL,
  verification_mh   NUMERIC(10,2) NOT NULL,
  doc_required      BOOLEAN NOT NULL DEFAULT FALSE,
  doc_mh            NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complexity_verification_map (
  complexity_level_id   INT NOT NULL REFERENCES complexity_levels(id),
  verification_level_id INT NOT NULL REFERENCES verification_levels(id),
  UNIQUE (complexity_level_id)
);

ALTER TABLE IF EXISTS item_estimations
  ADD COLUMN IF NOT EXISTS verification_mh NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS documentation_mh NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Source values: verification MH fixed per spec (8/24/40).
-- doc_mh are adjustable seeds: set real values per process knowledge.
INSERT INTO verification_levels (code, name, verification_mh, doc_required, doc_mh) VALUES
  ('V1', 'Verification Level 1',  8.00, FALSE,  4.00),
  ('V2', 'Verification Level 2', 24.00, TRUE,   8.00),
  ('V3', 'Verification Level 3', 40.00, TRUE,  16.00)
ON CONFLICT (code) DO NOTHING;

-- Complexity -> verification tier mapping (monotonic; L0 non-firmware maps nowhere).
INSERT INTO complexity_verification_map (complexity_level_id, verification_level_id)
SELECT cl.id, v.id FROM complexity_levels cl
JOIN verification_levels v ON v.code = CASE
  WHEN cl.code = 'L1' THEN 'V1'
  WHEN cl.code IN ('L2', 'L3') THEN 'V2'
  WHEN cl.code IN ('L4', 'L5') THEN 'V3'
END
WHERE cl.code IN ('L1', 'L2', 'L3', 'L4', 'L5')
ON CONFLICT (complexity_level_id) DO NOTHING;
