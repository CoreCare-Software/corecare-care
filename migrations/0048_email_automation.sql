CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  request_ip_hash TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_created
  ON password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expiry
  ON password_reset_tokens(expires_at, consumed_at);

ALTER TABLE platform_support_tickets ADD COLUMN central_ticket_id TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'local';
ALTER TABLE platform_support_tickets ADD COLUMN delivery_error TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN support_requester_name TEXT;
ALTER TABLE platform_support_tickets ADD COLUMN support_requester_email TEXT;

CREATE INDEX IF NOT EXISTS idx_care_support_delivery
  ON platform_support_tickets(delivery_status, updated_at DESC);
