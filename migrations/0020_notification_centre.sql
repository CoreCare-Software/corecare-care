-- CoreCare Enterprise 1.3.2 — Notification Centre
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  user_id TEXT,
  category TEXT NOT NULL DEFAULT 'system',
  priority TEXT NOT NULL DEFAULT 'information',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  source_id TEXT,
  action_url TEXT,
  read_at TEXT,
  acknowledged_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(archived_at,read_at,priority,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organisation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  in_app_enabled INTEGER NOT NULL DEFAULT 1,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  daily_digest INTEGER NOT NULL DEFAULT 0,
  weekly_digest INTEGER NOT NULL DEFAULT 0,
  critical_only INTEGER NOT NULL DEFAULT 0,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  category_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO notifications(id,category,priority,title,message,source) VALUES
('welcome-notifications','system','information','Notification Centre enabled','CoreCare Enterprise 1.3.2 notification management is now active.','release'),
('workflow-notifications','workflow','warning','Workflow monitoring active','Workflow failures and executive alerts can now be reviewed and acknowledged here.','workflow');
