PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  job_title TEXT NOT NULL DEFAULT 'Carer',
  employment_type TEXT NOT NULL DEFAULT 'Employee',
  phone TEXT,
  email TEXT,
  start_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  dbs_expiry TEXT,
  training_expiry TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_org_status ON staff(organisation_id,status);
CREATE INDEX IF NOT EXISTS idx_staff_org_name ON staff(organisation_id,last_name,first_name);

CREATE TABLE IF NOT EXISTS client_staff_assignments (
  client_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id,staff_id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (staff_id) REFERENCES staff(id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id)
);
