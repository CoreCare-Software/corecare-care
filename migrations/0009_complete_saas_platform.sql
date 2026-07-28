CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  monthly_price_pence INTEGER NOT NULL DEFAULT 0,
  max_users INTEGER,
  max_clients INTEGER,
  max_branches INTEGER,
  storage_mb INTEGER NOT NULL DEFAULT 1024,
  feature_flags_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_notifications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  link_type TEXT,
  link_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_error_log (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  user_id TEXT,
  route TEXT,
  method TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE organisations ADD COLUMN archived_at TEXT;
ALTER TABLE organisations ADD COLUMN licence_reference TEXT;
ALTER TABLE organisations ADD COLUMN renewal_date TEXT;
ALTER TABLE organisations ADD COLUMN max_branches INTEGER;
ALTER TABLE organisations ADD COLUMN storage_limit_mb INTEGER DEFAULT 1024;

INSERT OR IGNORE INTO subscription_plans(id,name,monthly_price_pence,max_users,max_clients,max_branches,storage_mb,feature_flags_json) VALUES
('trial','Trial',0,5,15,1,512,'{"care_plans":true,"rota":false,"medication":false,"family_portal":false,"finance":false,"ai":false}'),
('starter','Starter',7900,15,50,2,2048,'{"care_plans":true,"rota":true,"medication":false,"family_portal":false,"finance":false,"ai":false}'),
('professional','Professional',14900,50,250,10,10240,'{"care_plans":true,"rota":true,"medication":true,"family_portal":true,"finance":true,"ai":false}'),
('enterprise','Enterprise',29900,NULL,NULL,NULL,51200,'{"care_plans":true,"rota":true,"medication":true,"family_portal":true,"finance":true,"ai":true}'),
('development','Development',0,NULL,NULL,NULL,51200,'{"care_plans":true,"rota":true,"medication":true,"family_portal":true,"finance":true,"ai":true}');

CREATE INDEX IF NOT EXISTS idx_platform_notifications_status ON platform_notifications(status,created_at);
CREATE INDEX IF NOT EXISTS idx_api_error_log_created ON api_error_log(created_at);
