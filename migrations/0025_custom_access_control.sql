-- CoreCare Enterprise 1.6.0: organisation modules and user-specific access overrides
CREATE TABLE IF NOT EXISTS organisation_modules (
  organisation_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organisation_id,module_key),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL CHECK(effect IN ('allow','deny')),
  assigned_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organisation_id,user_id,permission_key),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_key) REFERENCES permission_catalog(permission_key) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user ON user_permission_overrides(organisation_id,user_id);

-- Seed permissions as independent statements for Cloudflare D1 compatibility.
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('dashboard.view','Dashboard','View organisation dashboard','Open the organisation dashboard.','standard');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('operations.view','Live operations','View live operations','View live visits, alerts and operational monitoring.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('operations.manage','Live operations','Manage live operations','Acknowledge alerts, manage incidents and intervene in live visits.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('rota.view','Scheduling','View rota','View planned and published visits.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('rota.create','Scheduling','Create visits','Create planned and recurring visits.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('rota.edit','Scheduling','Edit and allocate visits','Drag, allocate and amend planned visits.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('rota.publish','Scheduling','Publish rota','Publish rotas and notify staff.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('rota.cancel','Scheduling','Cancel visits','Cancel planned or published visits.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.view','Visits','View visits','View scheduled, live and completed visits.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.clock','Visits','Clock visits','Clock in and out of assigned visits.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.override','Visits','Override visit records','Correct or force-close visit records.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('medication.view','Medication','View medication','View medication records and alerts.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('medication.manage','Medication','Manage medication','Record and manage medication activity.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('tasks.view','Tasks','View tasks','View operational and care tasks.','standard');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('tasks.manage','Tasks','Manage tasks','Create, assign, complete and escalate tasks.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('incidents.view','Incidents','View incidents','View incident and safeguarding records.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('incidents.manage','Incidents','Manage incidents','Create, review and close incidents.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('finance.view','Finance','View finance','View invoicing, payroll and financial summaries.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('finance.manage','Finance','Manage finance','Create and amend financial records.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('family_portal.manage','Family portal','Manage family access','Create and manage family portal access.','high');

-- Seed each module independently. Avoid compound SELECT limits in D1.
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'dashboard',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'operations',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'clients',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'staff',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'family',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'care',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'medication',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'visits',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'rota',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'tasks',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'incidents',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'finance',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'reports',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'settings',1 FROM organisations;
