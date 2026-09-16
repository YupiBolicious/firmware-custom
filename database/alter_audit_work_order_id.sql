-- Audit trail work-order targeting.
-- Stamps each row with the work order it touches (nullable: LOGIN / user-mgmt actions
-- have none), so the audit feed can join work_orders on a plain integer FK instead of
-- a text-cast JSONB expression (details->>'work_order_id'), which is not indexable.
-- ON DELETE SET NULL: audit rows must outlive the work order (mirror of the
-- audit_trail.user_id FK problem, which blocks user deletion — avoided on purpose).
ALTER TABLE audit_trail
  ADD COLUMN IF NOT EXISTS work_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL;

-- Partial index: most audit rows are not work-order-scoped (LOGIN, user mgmt, ...),
-- so index only the stamped ones — matches entity_type READ patterns.
CREATE INDEX IF NOT EXISTS idx_audit_trail_work_order_id
  ON audit_trail (work_order_id) WHERE work_order_id IS NOT NULL;

-- Audit feed ordering: dedicated descending index so ORDER BY created_at DESC LIMIT n
-- uses an index scan instead of seq-scan + sort.
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at_desc ON audit_trail (created_at DESC);

-- One-time backfill: stamp existing rows from the old polymorphic targeting
-- (WORK_ORDER rows: entity_id; everything else: details->>'work_order_id').
-- Guarded on work_order_id IS NULL so re-runs are no-ops.
UPDATE audit_trail at
SET work_order_id = w.id
FROM work_orders w
WHERE at.work_order_id IS NULL
  AND w.id::text = CASE
        WHEN at.entity_type = 'WORK_ORDER' THEN at.entity_id::text
        ELSE at.details->>'work_order_id'
      END;