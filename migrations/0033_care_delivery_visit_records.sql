PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS visit_care_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  staff_id TEXT,
  mood TEXT NOT NULL DEFAULT 'not_recorded',
  wellbeing TEXT NOT NULL DEFAULT 'no_change',
  care_notes TEXT NOT NULL DEFAULT '',
  fluid_intake_ml INTEGER NOT NULL DEFAULT 0,
  nutrition TEXT NOT NULL DEFAULT 'not_recorded',
  toileting TEXT NOT NULL DEFAULT 'not_recorded',
  mobility_support TEXT NOT NULL DEFAULT '',
  skin_observation TEXT NOT NULL DEFAULT '',
  body_map_notes TEXT NOT NULL DEFAULT '',
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  follow_up_notes TEXT NOT NULL DEFAULT '',
  completed_by TEXT,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id, visit_id)
);
CREATE INDEX IF NOT EXISTS idx_visit_care_records_client ON visit_care_records(organisation_id,client_id,completed_at);

CREATE TABLE IF NOT EXISTS visit_task_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,visit_id,task_key)
);

CREATE TABLE IF NOT EXISTS visit_medication_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  medication_name TEXT NOT NULL DEFAULT 'Scheduled medication',
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  signature_name TEXT NOT NULL DEFAULT '',
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_visit_medication_client ON visit_medication_records(organisation_id,client_id,recorded_at);
