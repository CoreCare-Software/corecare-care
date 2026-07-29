PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operations_tasks (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT,
  assigned_staff_id TEXT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Care',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  due_at TEXT,
  completed_at TEXT,
  escalated_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_board ON operations_tasks(organisation_id,status,due_at);

CREATE TABLE IF NOT EXISTS operations_incidents (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT,
  reported_by TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  occurred_at TEXT,
  manager_review TEXT DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operations_incidents_board ON operations_incidents(organisation_id,status,severity,created_at);

CREATE TABLE IF NOT EXISTS shift_handovers (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  shift TEXT NOT NULL,
  summary TEXT NOT NULL,
  concerns TEXT DEFAULT '',
  outstanding_actions TEXT DEFAULT '',
  created_by TEXT,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shift_handovers_board ON shift_handovers(organisation_id,created_at DESC);
