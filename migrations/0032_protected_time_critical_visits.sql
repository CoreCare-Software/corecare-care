-- CoreCare Enterprise 1.15.1 — Protected time-critical visits
ALTER TABLE client_visit_requirements ADD COLUMN scheduling_rule TEXT NOT NULL DEFAULT 'flexible';
ALTER TABLE client_visit_requirements ADD COLUMN time_critical_reason TEXT;
ALTER TABLE care_visits ADD COLUMN protected_time_rule TEXT NOT NULL DEFAULT 'flexible';
ALTER TABLE care_visits ADD COLUMN protected_time_reason TEXT;
ALTER TABLE care_visits ADD COLUMN protected_window_minutes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS protected_visit_authorisations (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  authorised_by TEXT NOT NULL,
  previous_start TEXT NOT NULL,
  new_start TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_protected_visit_authorisations_visit ON protected_visit_authorisations(organisation_id,visit_id,created_at);
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description) VALUES
('rota.time_critical.override','Rota','Override protected visit times','Authorise changes to fixed-time and time-window client visits.');
