-- Custom Items become WO-level: an item applies to all Machine Models of the WO.
-- work_order_group_id is kept (nullable) only to preserve legacy group-scoped rows.
ALTER TABLE work_order_items ALTER COLUMN work_order_group_id DROP NOT NULL;
ALTER TABLE work_order_items DROP CONSTRAINT work_order_items_work_order_group_id_item_number_key;
ALTER TABLE work_order_items DROP CONSTRAINT work_order_items_work_order_group_id_fkey;
ALTER TABLE work_order_items ADD CONSTRAINT work_order_items_work_order_group_id_fkey
    FOREIGN KEY (work_order_group_id) REFERENCES work_order_groups(id) ON DELETE SET NULL;