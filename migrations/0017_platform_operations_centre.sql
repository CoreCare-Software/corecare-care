PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  schedule_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  last_run_at TEXT,
  last_result TEXT,
  next_run_at TEXT,
  duration_ms INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_incidents (
  id TEXT PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_jobs_status ON platform_jobs(status,next_run_at);
CREATE INDEX IF NOT EXISTS idx_platform_incidents_status ON platform_incidents(status,severity,started_at);

INSERT OR IGNORE INTO platform_jobs(id,name,description,schedule_label,status,last_result,next_run_at) VALUES
('session-cleanup','Session cleanup','Expires and removes stale authentication sessions.','Every hour','healthy','Ready',datetime('now','+1 hour')),
('health-snapshot','Platform health snapshot','Captures platform health and operational activity.','Every 15 minutes','healthy','Ready',datetime('now','+15 minutes')),
('renewal-review','Renewal exposure review','Reviews customer renewal dates and commercial exposure.','Daily at 06:00','healthy','Ready',datetime('now','+1 day','start of day','+6 hours')),
('customer-health','Customer health recalculation','Recalculates organisation health and adoption indicators.','Daily at 05:30','healthy','Ready',datetime('now','+1 day','start of day','+5 hours','+30 minutes')),
('audit-retention','Audit retention check','Checks audit-log retention and storage governance.','Weekly on Sunday','scheduled','Awaiting first run',datetime('now','+7 days'));
