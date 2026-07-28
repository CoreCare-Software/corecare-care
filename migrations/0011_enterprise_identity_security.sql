-- CoreCare Sprint 11: enterprise identity, custom roles and central permission engine
CREATE TABLE IF NOT EXISTS permission_catalog (
  permission_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  risk_level TEXT NOT NULL DEFAULT 'standard',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_roles (
  id TEXT PRIMARY KEY,
  organisation_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  colour TEXT DEFAULT '#0f766e',
  scope_type TEXT NOT NULL DEFAULT 'organisation',
  is_system INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,name),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS custom_role_permissions (
  role_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow' CHECK(effect IN ('allow','deny')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(role_id,permission_key),
  FOREIGN KEY (role_id) REFERENCES custom_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_key) REFERENCES permission_catalog(permission_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_custom_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  valid_from TEXT,
  valid_until TEXT,
  assigned_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES custom_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS organisation_security_policies (
  organisation_id TEXT PRIMARY KEY,
  require_mfa INTEGER NOT NULL DEFAULT 0,
  session_hours INTEGER NOT NULL DEFAULT 12,
  idle_timeout_minutes INTEGER NOT NULL DEFAULT 60,
  allow_password_login INTEGER NOT NULL DEFAULT 1,
  require_trusted_device INTEGER NOT NULL DEFAULT 0,
  allowed_ip_ranges TEXT DEFAULT '[]',
  allowed_countries TEXT DEFAULT '["GB"]',
  emergency_mode INTEGER NOT NULL DEFAULT 0,
  emergency_reason TEXT,
  emergency_started_at TEXT,
  emergency_started_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON custom_roles(organisation_id,is_active,name);
CREATE INDEX IF NOT EXISTS idx_user_custom_roles_user ON user_custom_roles(user_id,organisation_id);

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES
('platform.organisations.view','Platform','View organisations','View all customer organisations.','standard'),
('platform.organisations.manage','Platform','Manage organisations','Create, edit, suspend and license organisations.','high'),
('platform.support.enter','Platform','Enter support mode','Enter an organisation support workspace.','high'),
('platform.audit.view','Platform','View platform audit','View platform-wide security and activity logs.','high'),
('platform.billing.view','Platform','View platform billing','View subscriptions, revenue and renewals.','sensitive'),
('organisation.settings.view','Organisation','View settings','View organisation configuration.','standard'),
('organisation.settings.manage','Organisation','Manage settings','Change organisation branding and configuration.','high'),
('security.roles.view','Security','View roles','View roles and effective permissions.','standard'),
('security.roles.manage','Security','Manage roles','Create roles and change permission grants.','critical'),
('security.users.view','Security','View users','View user accounts and access assignments.','standard'),
('security.users.manage','Security','Manage users','Create, disable and assign access to users.','critical'),
('security.audit.view','Security','View audit history','View organisation audit events.','sensitive'),
('security.sessions.manage','Security','Manage sessions','Revoke active user sessions.','critical'),
('clients.view','Clients','View clients','View client records.','sensitive'),
('clients.create','Clients','Create clients','Create client records.','high'),
('clients.edit','Clients','Edit clients','Edit client records.','high'),
('clients.archive','Clients','Archive clients','Archive client records.','critical'),
('staff.view','Staff','View staff','View staff records.','sensitive'),
('staff.create','Staff','Create staff','Create staff records.','high'),
('staff.edit','Staff','Edit staff','Edit staff records.','high'),
('care_plans.view','Care planning','View care plans','View care plans.','sensitive'),
('care_plans.create','Care planning','Create care plans','Create care plans.','high'),
('care_plans.edit','Care planning','Edit care plans','Edit and version care plans.','high'),
('care_plans.archive','Care planning','Archive care plans','Archive care plans.','critical'),
('risks.view','Risk','View risks','View risk assessments.','sensitive'),
('risks.manage','Risk','Manage risks','Create and edit risk assessments.','high'),
('documents.view','Documents','View documents','View client document records.','sensitive'),
('documents.manage','Documents','Manage documents','Create and archive document records.','high'),
('reports.view','Reports','View reports','View operational and compliance reports.','sensitive'),
('data.export','Data','Export data','Export organisation or client data.','critical');

INSERT OR IGNORE INTO organisation_security_policies(organisation_id)
SELECT id FROM organisations;
