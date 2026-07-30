PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN staff_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_staff_login
ON users(organisation_id, staff_id)
WHERE staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_staff_lookup
ON users(organisation_id, staff_id, status);
