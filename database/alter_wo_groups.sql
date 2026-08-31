-- One-off migration for existing databases to the WO -> Model/Version/SN groups flow.
-- Makes work_orders.title nullable, moves model/version off the WO onto work_order_groups,
-- and scopes work_order_items to a group with per-group unique item numbers.

BEGIN;

-- 1) Create the groups table (matches schema.sql)
CREATE TABLE IF NOT EXISTS work_order_groups (
    id                         SERIAL PRIMARY KEY,
    work_order_id              INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    machine_model_id           INT REFERENCES machine_model(id),
    machine_model_version_id   INT REFERENCES machine_model_ver(id),
    serial_number              VARCHAR(100),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (work_order_id, machine_model_id, machine_model_version_id, serial_number)
);

-- 2) Backfill one group per existing work order from its WO-level model/version (SN unknown)
INSERT INTO work_order_groups (work_order_id, machine_model_id, machine_model_version_id)
SELECT wo.id, wo.machine_model_id, wo.machine_model_version_id
FROM work_orders wo
ON CONFLICT DO NOTHING;

-- 3) Add the item -> group FK column and backfill
ALTER TABLE work_order_items ADD COLUMN IF NOT EXISTS work_order_group_id INT REFERENCES work_order_groups(id) ON DELETE CASCADE;

UPDATE work_order_items woi
SET work_order_group_id = wog.id
FROM work_order_groups wog
WHERE wog.work_order_id = woi.work_order_id;

ALTER TABLE work_order_items ALTER COLUMN work_order_group_id SET NOT NULL;

-- 4) Item numbers unique per group instead of per WO
ALTER TABLE work_order_items DROP CONSTRAINT IF EXISTS work_order_items_work_order_id_item_number_key;
ALTER TABLE work_order_items ADD CONSTRAINT work_order_items_work_order_group_id_item_number_key UNIQUE (work_order_group_id, item_number);

-- 5) Drop the WO-level model/version columns (now on groups) and make title nullable
ALTER TABLE work_orders DROP COLUMN IF EXISTS machine_model_id;
ALTER TABLE work_orders DROP COLUMN IF EXISTS machine_model_version_id;
ALTER TABLE work_orders ALTER COLUMN title DROP NOT NULL;

-- 6) Index for group lookups
CREATE INDEX IF NOT EXISTS idx_work_order_groups_work_order_id ON work_order_groups(work_order_id);

COMMIT;