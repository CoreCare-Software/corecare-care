-- CoreCare Enterprise 1.1.0 — Executive Platform Command Centre
CREATE INDEX IF NOT EXISTS idx_organisations_subscription_plan ON organisations(subscription_plan,status);
CREATE INDEX IF NOT EXISTS idx_organisations_renewal_date ON organisations(renewal_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON audit_log(organisation_id,created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);
