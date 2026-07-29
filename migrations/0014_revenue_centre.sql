-- CoreCare Enterprise 1.1.1 — Revenue Centre
CREATE TABLE IF NOT EXISTS revenue_events (
  id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, event_type TEXT NOT NULL, amount_pence INTEGER NOT NULL DEFAULT 0, effective_date TEXT NOT NULL, plan_id TEXT, notes TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id), FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_revenue_events_effective_date ON revenue_events(effective_date,event_type);
CREATE INDEX IF NOT EXISTS idx_revenue_events_organisation ON revenue_events(organisation_id,effective_date);
