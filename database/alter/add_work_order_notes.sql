-- Work order notes (coder note field, single text per WO).
ALTER TABLE work_orders
    ADD COLUMN IF NOT EXISTS notes TEXT;