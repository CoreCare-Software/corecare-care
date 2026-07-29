-- CoreCare Enterprise 1.3.1 — Workflow Engine
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'platform',
  trigger_type TEXT NOT NULL,
  trigger_config_json TEXT NOT NULL DEFAULT '{}',
  conditions_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_workflows_scope ON workflow_definitions(scope,organisation_id,status);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  organisation_id TEXT,
  trigger_type TEXT NOT NULL,
  trigger_payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running',
  actions_total INTEGER NOT NULL DEFAULT 0,
  actions_completed INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT,
  duration_ms INTEGER,
  initiated_by TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflow_definitions(id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id)
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id,started_at DESC);

CREATE TABLE IF NOT EXISTS workflow_queue (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  run_id TEXT,
  execute_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workflow_queue_due ON workflow_queue(status,execute_at);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO workflow_templates(id,name,description,category,definition_json) VALUES
('tpl-care-review','Care plan review due','Create a manager task when a care plan reaches its review date.','care','{"triggerType":"care_plan_review_due","conditions":[],"actions":[{"type":"create_task","label":"Create review task"},{"type":"notify_manager","label":"Notify manager"}]}'),
('tpl-training-expiry','Staff training expiry','Notify the branch manager before mandatory training expires.','staff','{"triggerType":"staff_training_expiring","conditions":[{"field":"daysUntilExpiry","operator":"less_than","value":"30"}],"actions":[{"type":"notify_manager","label":"Notify manager"},{"type":"create_task","label":"Create renewal task"}]}'),
('tpl-renewal','Subscription renewal approaching','Raise a customer-success alert ahead of renewal.','commercial','{"triggerType":"subscription_renewal_approaching","conditions":[{"field":"daysUntilRenewal","operator":"less_than","value":"60"}],"actions":[{"type":"executive_alert","label":"Raise executive alert"},{"type":"audit_entry","label":"Record audit entry"}]}');
