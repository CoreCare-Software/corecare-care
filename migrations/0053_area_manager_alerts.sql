PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level)
VALUES ('manager_alerts.view','Manager alerts','View manager alerts','View persistent operational alerts for incidents, visits, medication, care governance, tasks and access reviews.','sensitive');

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level)
VALUES ('manager_alerts.acknowledge','Manager alerts','Acknowledge manager alerts','Record that an operational alert has been seen and accepted for management follow-up.','high');

CREATE TABLE IF NOT EXISTS manager_alert_acknowledgements (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('critical','warning','information')),
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,user_id,alert_key),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manager_alert_acknowledgements_user
ON manager_alert_acknowledgements(organisation_id,user_id,acknowledged_at DESC);

CREATE TRIGGER IF NOT EXISTS tenant_guard_manager_alert_ack_insert
BEFORE INSERT ON manager_alert_acknowledgements
WHEN NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id=NEW.user_id AND u.organisation_id=NEW.organisation_id
)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: manager alert acknowledgement user'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_manager_alert_ack_update
BEFORE UPDATE ON manager_alert_acknowledgements
WHEN NEW.organisation_id<>OLD.organisation_id
  OR NEW.user_id<>OLD.user_id
  OR NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id=NEW.user_id AND u.organisation_id=NEW.organisation_id
  )
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: manager alert acknowledgement update'); END;

