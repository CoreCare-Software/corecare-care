PRAGMA foreign_keys = ON;

ALTER TABLE care_plans ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE care_plans ADD COLUMN approved_by TEXT;
ALTER TABLE care_plans ADD COLUMN approved_at TEXT;
ALTER TABLE care_plans ADD COLUMN visit_generation_status TEXT NOT NULL DEFAULT 'not_generated';
ALTER TABLE care_plans ADD COLUMN visits_generated_at TEXT;

CREATE TABLE IF NOT EXISTS care_delivery_alerts (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT,
  care_plan_id TEXT,
  risk_assessment_id TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_care_delivery_alerts_open ON care_delivery_alerts(organisation_id,status,severity,due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_care_delivery_alert_unique ON care_delivery_alerts(organisation_id,alert_type,COALESCE(care_plan_id,''),COALESCE(risk_assessment_id,''),COALESCE(client_id,'')) WHERE status='open';

CREATE TABLE IF NOT EXISTS care_review_schedule (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  assigned_to TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,record_type,record_id,due_date)
);
CREATE INDEX IF NOT EXISTS idx_care_review_schedule_due ON care_review_schedule(organisation_id,status,due_date);
