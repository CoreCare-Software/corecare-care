-- CoreCare 1.24.0 — eMAR and Body Map
CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  strength TEXT,
  form TEXT,
  route TEXT,
  dose TEXT NOT NULL,
  instructions TEXT,
  frequency TEXT,
  scheduled_times_json TEXT NOT NULL DEFAULT '[]',
  start_date TEXT,
  end_date TEXT,
  is_prn INTEGER NOT NULL DEFAULT 0,
  prn_protocol TEXT,
  min_interval_minutes INTEGER,
  max_dose_24h TEXT,
  stock_quantity REAL,
  stock_unit TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_medications_org_client ON medications(organisation_id,client_id,status);

CREATE TABLE IF NOT EXISTS medication_administrations (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  visit_id TEXT,
  scheduled_at TEXT,
  administered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outcome TEXT NOT NULL,
  dose_given TEXT,
  reason TEXT,
  notes TEXT,
  stock_change REAL NOT NULL DEFAULT 0,
  recorded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(medication_id) REFERENCES medications(id),
  FOREIGN KEY(client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_mar_org_client_time ON medication_administrations(organisation_id,client_id,administered_at);

CREATE TABLE IF NOT EXISTS body_map_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  view TEXT NOT NULL DEFAULT 'front',
  x_percent REAL NOT NULL,
  y_percent REAL NOT NULL,
  concern_type TEXT NOT NULL,
  body_location TEXT,
  description TEXT NOT NULL,
  size TEXT,
  appearance TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  action_taken TEXT,
  monitoring_plan TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  first_observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_body_map_org_client ON body_map_records(organisation_id,client_id,status);

CREATE TABLE IF NOT EXISTS body_map_updates (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  body_map_record_id TEXT NOT NULL,
  note TEXT NOT NULL,
  appearance TEXT,
  action_taken TEXT,
  status TEXT,
  recorded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(body_map_record_id) REFERENCES body_map_records(id)
);
CREATE INDEX IF NOT EXISTS idx_body_map_updates_record ON body_map_updates(body_map_record_id,created_at);
