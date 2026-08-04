PRAGMA foreign_keys = ON;

-- Reuse the Platform product-health poll to claim Care's hourly maintenance.
-- This avoids consuming a sixth account-level Cloudflare cron trigger while
-- retaining an atomic, auditable execution lock inside the Care database.
CREATE TABLE IF NOT EXISTS system_maintenance_state (
  job_key TEXT PRIMARY KEY,
  last_started_at TEXT,
  last_completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','succeeded','failed')),
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO system_maintenance_state(job_key)
VALUES ('hourly');
