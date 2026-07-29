ALTER TABLE care_visits ADD COLUMN template_id TEXT;
-- CoreCare Enterprise 1.13.0 — Intelligent Template & Recurrence Engine
CREATE TABLE IF NOT EXISTS rota_visit_templates (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  visit_type TEXT NOT NULL DEFAULT 'Care visit',
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
  preferred_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  carers_required INTEGER NOT NULL DEFAULT 1,
  preferred_staff_id TEXT,
  backup_staff_id TEXT,
  window_minutes INTEGER NOT NULL DEFAULT 15,
  effective_from TEXT,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rota_visit_templates_org_day ON rota_visit_templates(organisation_id,day_of_week,status);

CREATE TABLE IF NOT EXISTS staff_working_patterns (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Normal working pattern',
  cycle_weeks INTEGER NOT NULL DEFAULT 1,
  week_number INTEGER NOT NULL DEFAULT 1,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_patterns_org_staff ON staff_working_patterns(organisation_id,staff_id,status);

CREATE TABLE IF NOT EXISTS rota_template_exceptions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  exception_type TEXT NOT NULL,
  staff_id TEXT,
  client_id TEXT,
  template_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  action TEXT NOT NULL DEFAULT 'exclude',
  replacement_staff_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rota_exceptions_org_dates ON rota_template_exceptions(organisation_id,start_at,end_at);

CREATE TABLE IF NOT EXISTS rota_generation_runs (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  week_commencing TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  templates_considered INTEGER NOT NULL DEFAULT 0,
  visits_created INTEGER NOT NULL DEFAULT 0,
  visits_skipped INTEGER NOT NULL DEFAULT 0,
  visits_unallocated INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  generated_by TEXT,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES
('rota.templates.view','Rota','View rota templates','View client recurring visits, staff patterns and assignment templates.','standard'),
('rota.templates.manage','Rota','Manage rota templates','Create and change recurring visit templates, working patterns and exceptions.','sensitive'),
('rota.templates.generate','Rota','Generate rota from templates','Generate or regenerate future rota weeks from approved templates.','sensitive');
