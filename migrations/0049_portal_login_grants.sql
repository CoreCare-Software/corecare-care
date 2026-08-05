-- One-time, short-lived grants used by the private CoreCare identity broker.
CREATE TABLE IF NOT EXISTS portal_login_grants (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_login_grants_expiry
  ON portal_login_grants(expires_at, consumed_at);
