CREATE TABLE IF NOT EXISTS care_plans (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  version INTEGER NOT NULL DEFAULT 1,
  effective_date TEXT,
  review_date TEXT NOT NULL,
  author_name TEXT,
  personal_details TEXT DEFAULT '',
  medical_conditions TEXT DEFAULT '',
  communication TEXT DEFAULT '',
  mobility TEXT DEFAULT '',
  nutrition_hydration TEXT DEFAULT '',
  medication_support TEXT DEFAULT '',
  continence TEXT DEFAULT '',
  skin_integrity TEXT DEFAULT '',
  mental_capacity TEXT DEFAULT '',
  risks TEXT DEFAULT '',
  desired_outcomes TEXT DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_care_plans_client ON care_plans(organisation_id, client_id, status);
CREATE INDEX IF NOT EXISTS idx_care_plans_review ON care_plans(organisation_id, review_date);

CREATE TABLE IF NOT EXISTS care_plan_versions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  care_plan_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_care_plan_versions ON care_plan_versions(care_plan_id, version DESC);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'Medium',
  likelihood TEXT NOT NULL DEFAULT 'Possible',
  controls TEXT DEFAULT '',
  actions TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  review_date TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_risks_client ON risk_assessments(organisation_id, client_id, status);

CREATE TABLE IF NOT EXISTS client_documents (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'Other',
  document_date TEXT,
  review_date TEXT,
  reference_url TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Current',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
CREATE INDEX IF NOT EXISTS idx_documents_client ON client_documents(organisation_id, client_id, status);
