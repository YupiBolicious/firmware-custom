-- One-off migration for existing databases: production task completion flag.
-- Replaces production_tasks.status (VARCHAR 'OPEN') with a boolean
-- completed (FALSE = open, TRUE = closed). All existing tasks were 'OPEN'.

BEGIN;

ALTER TABLE production_tasks ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE production_tasks DROP COLUMN IF EXISTS status;

-- Index for completion state lookups on a work order
CREATE INDEX IF NOT EXISTS idx_production_tasks_completed ON production_tasks(work_order_id, completed);

COMMIT;