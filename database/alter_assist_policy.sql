-- Structured "why coder review" reasons, 2026-09-23.
-- review_reason         machine-readable reason the item was routed to human review
--                       (NO_EXACT_OR_RULE_MATCH | SEMANTIC_CANDIDATE_LOW_QUALITY |
--                        NO_USABLE_SEMANTIC_CANDIDATE | CODE_MODEL_MISMATCH)
-- assist_blocked_reason first block code from the assist rule when NO suggestion fired
--                       (NO_SEMANTIC_CANDIDATE | SCORE_BELOW_FLOOR | ROW_UNRESOLVED |
--                        MODEL_CODE_MISMATCH | VERSION_MISMATCH | SERIAL_MISMATCH |
--                        MEASUREMENT_MISMATCH); NULL when an assist suggestion exists.
-- Both nullable: no backfill needed; populated on the next analyze.
ALTER TABLE classifications
  ADD COLUMN IF NOT EXISTS review_reason VARCHAR(50),
  ADD COLUMN IF NOT EXISTS assist_blocked_reason VARCHAR(100);