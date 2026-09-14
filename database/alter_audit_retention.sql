-- Audit trail retention support.
-- Dedicated index so the purge script (backend/scripts/purge-audit-log.js)
-- and archival scans can use a range scan on created_at.
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail (created_at);