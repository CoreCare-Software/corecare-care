-- CoreCare Enterprise 1.13.1 — Rota-First Recurring Visits
ALTER TABLE rota_visit_templates ADD COLUMN series_id TEXT;
ALTER TABLE rota_visit_templates ADD COLUMN interval_weeks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rota_visit_templates ADD COLUMN end_after_occurrences INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rota_visit_templates ADD COLUMN paused_at TEXT;
CREATE INDEX IF NOT EXISTS idx_rota_visit_templates_series ON rota_visit_templates(organisation_id,series_id,status);
UPDATE rota_visit_templates SET series_id=id WHERE series_id IS NULL;
