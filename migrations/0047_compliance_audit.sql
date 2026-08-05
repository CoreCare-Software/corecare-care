-- CoreCare Care route-level compliance evidence. Payloads and credentials are intentionally excluded.
CREATE TABLE IF NOT EXISTS compliance_audit_events (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL,
  scope_id TEXT,
  actor_user_id TEXT,
  http_method TEXT NOT NULL,
  route TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('succeeded','rejected','failed')),
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_scope_time ON compliance_audit_events(scope_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_route_time ON compliance_audit_events(route,occurred_at DESC);
PRAGMA optimize;

