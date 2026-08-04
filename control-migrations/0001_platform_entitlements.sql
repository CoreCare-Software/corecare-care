CREATE TABLE IF NOT EXISTS corecare_platform_entitlements (
  external_organisation_id TEXT PRIMARY KEY,
  platform_organisation_id TEXT NOT NULL,
  contract_version TEXT,
  contract_checksum TEXT,
  features_json TEXT NOT NULL DEFAULT '{}',
  details_json TEXT NOT NULL DEFAULT '[]',
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','applied_pending_ack','applied','failed')),
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_requested_at TEXT,
  applied_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_care_entitlements_retry
  ON corecare_platform_entitlements(sync_status,next_attempt_at);
