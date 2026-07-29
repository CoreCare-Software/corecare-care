-- CoreCare Sprint 12: login history, trusted devices and emergency security controls
CREATE TABLE IF NOT EXISTS login_history (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT,
  outcome TEXT NOT NULL,
  reason TEXT,
  ip_hint TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_name TEXT,
  fingerprint_hash TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  last_seen_at TEXT,
  revoked_at TEXT,
  UNIQUE(user_id,fingerprint_hash),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_login_history_org ON login_history(organisation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id,revoked_at);
