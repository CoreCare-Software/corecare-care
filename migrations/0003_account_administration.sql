PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;

UPDATE users SET must_change_password = 1 WHERE id = 'user-demo-owner';

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_hint TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_updated ON login_attempts(updated_at);
