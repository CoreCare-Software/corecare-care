PRAGMA foreign_keys = ON;

ALTER TABLE branches ADD COLUMN archived_at TEXT;

ALTER TABLE api_error_log ADD COLUMN request_id TEXT;
ALTER TABLE api_error_log ADD COLUMN product_code TEXT NOT NULL DEFAULT 'CARE';
ALTER TABLE api_error_log ADD COLUMN status_code INTEGER NOT NULL DEFAULT 500;
ALTER TABLE api_error_log ADD COLUMN error_name TEXT;

CREATE INDEX IF NOT EXISTS idx_api_error_log_request
ON api_error_log(request_id);

CREATE INDEX IF NOT EXISTS idx_api_error_log_product_created
ON api_error_log(product_code,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branches_archive
ON branches(organisation_id,archived_at,status,name);

