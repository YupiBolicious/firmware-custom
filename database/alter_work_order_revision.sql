ALTER TABLE work_orders
    ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'work_orders_revision_nonnegative'
          AND conrelid = 'work_orders'::regclass
    ) THEN
        ALTER TABLE work_orders
            ADD CONSTRAINT work_orders_revision_nonnegative CHECK (revision >= 0);
    END IF;
END $$;