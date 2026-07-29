PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS client_visit_requirements (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  visit_type TEXT NOT NULL DEFAULT 'Personal care',
  days_json TEXT NOT NULL DEFAULT '[1,2,3,4,5,6,0]',
  preferred_time TEXT NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 60,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  carers_required INTEGER NOT NULL DEFAULT 1,
  skills_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_visit_requirements_client ON client_visit_requirements(organisation_id,client_id,status);

CREATE TABLE IF NOT EXISTS client_onboarding_items (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'outstanding',
  due_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,client_id,item_key)
);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_open ON client_onboarding_items(organisation_id,status,due_at);

ALTER TABLE care_visits ADD COLUMN requirement_id TEXT;
ALTER TABLE care_visits ADD COLUMN requirement_occurrence_date TEXT;
ALTER TABLE care_visits ADD COLUMN change_reason TEXT DEFAULT '';
ALTER TABLE care_visits ADD COLUMN manually_overridden INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_requirement_occurrence ON care_visits(organisation_id,requirement_id,requirement_occurrence_date) WHERE requirement_id IS NOT NULL AND rota_status!='cancelled';

CREATE TABLE IF NOT EXISTS visit_change_history (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  requirement_id TEXT,
  change_scope TEXT NOT NULL DEFAULT 'single',
  reason TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_visit_change_history ON visit_change_history(organisation_id,visit_id,created_at DESC);
