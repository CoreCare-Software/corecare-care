-- CoreCare v1.23.0 — Structured, person-centred care plans
ALTER TABLE care_plans ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'Comprehensive care plan';
ALTER TABLE care_plans ADD COLUMN plan_summary TEXT DEFAULT '';
ALTER TABLE care_plans ADD COLUMN what_matters TEXT DEFAULT '';
ALTER TABLE care_plans ADD COLUMN preferences TEXT DEFAULT '';
ALTER TABLE care_plans ADD COLUMN consent_status TEXT NOT NULL DEFAULT 'Not recorded';
ALTER TABLE care_plans ADD COLUMN capacity_status TEXT NOT NULL DEFAULT 'Not assessed';
ALTER TABLE care_plans ADD COLUMN decision_maker TEXT DEFAULT '';
ALTER TABLE care_plans ADD COLUMN submitted_by TEXT;
ALTER TABLE care_plans ADD COLUMN submitted_at TEXT;
ALTER TABLE care_plans ADD COLUMN review_notes TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS care_plan_sections (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  care_plan_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  assessed_needs TEXT DEFAULT '',
  desired_outcomes TEXT DEFAULT '',
  support_instructions TEXT DEFAULT '',
  risks_controls TEXT DEFAULT '',
  personal_preferences TEXT DEFAULT '',
  review_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (care_plan_id) REFERENCES care_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_care_plan_sections_plan ON care_plan_sections(organisation_id, care_plan_id, sort_order);
