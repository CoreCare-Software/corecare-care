-- CoreCare Care: Microsoft Authenticator MFA, recovery codes and MFA-aware sessions.

CREATE TABLE IF NOT EXISTS mfa_enrolments (
  user_id TEXT PRIMARY KEY,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
  last_used_counter INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enabled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,code_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id,used_at);

CREATE TABLE IF NOT EXISTS mfa_login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('enrol','login')),
  expires_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  ip_hint TEXT,
  user_agent TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_user ON mfa_login_challenges(user_id,expires_at,consumed_at);

ALTER TABLE sessions ADD COLUMN mfa_verified_at TEXT;
ALTER TABLE sessions ADD COLUMN authentication_method TEXT NOT NULL DEFAULT 'password';
ALTER TABLE password_reset_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'reset' CHECK(purpose IN ('reset','activation'));

-- Privileged accounts must complete Authenticator enrolment at their next sign-in.
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE access_level IN ('organisation_owner','organisation_admin','area_manager','registered_manager','branch_manager') OR role IN ('owner','manager'));
