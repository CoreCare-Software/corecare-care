PRAGMA foreign_keys = ON;

ALTER TABLE organisations ADD COLUMN slug TEXT;
ALTER TABLE organisations ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE organisations ADD COLUMN subscription_plan TEXT NOT NULL DEFAULT 'development';
ALTER TABLE organisations ADD COLUMN suspended_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_slug ON organisations(slug);
UPDATE organisations SET slug=lower(replace(name,' ','-')) WHERE slug IS NULL;

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organisation_id,status,name);
INSERT OR IGNORE INTO branches(id,organisation_id,name,code) VALUES('branch-demo-main','org-demo','Main Branch','MAIN');

ALTER TABLE users ADD COLUMN access_level TEXT NOT NULL DEFAULT 'organisation_admin';
ALTER TABLE users ADD COLUMN home_branch_id TEXT;
ALTER TABLE users ADD COLUMN is_platform_user INTEGER NOT NULL DEFAULT 0;
UPDATE users SET access_level=CASE role WHEN 'owner' THEN 'organisation_owner' WHEN 'manager' THEN 'branch_manager' WHEN 'carer' THEN 'carer' ELSE 'auditor' END;
UPDATE users SET access_level='platform_owner',is_platform_user=1 WHERE id='user-demo-owner';
UPDATE users SET home_branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND home_branch_id IS NULL;

CREATE TABLE IF NOT EXISTS organisation_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  access_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,organisation_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO organisation_memberships(id,user_id,organisation_id,access_level)
SELECT 'membership-'||id,id,organisation_id,access_level FROM users;

CREATE TABLE IF NOT EXISTS branch_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  branch_id TEXT NOT NULL,
  access_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,branch_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO branch_memberships(id,user_id,organisation_id,branch_id,access_level)
SELECT 'branch-membership-'||id,id,organisation_id,home_branch_id,access_level FROM users WHERE home_branch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS family_client_access (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  can_view_profile INTEGER NOT NULL DEFAULT 1,
  can_view_visits INTEGER NOT NULL DEFAULT 1,
  can_view_care_updates INTEGER NOT NULL DEFAULT 1,
  can_view_documents INTEGER NOT NULL DEFAULT 0,
  can_view_medication INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,client_id),
  FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
);

ALTER TABLE clients ADD COLUMN branch_id TEXT;
ALTER TABLE staff ADD COLUMN branch_id TEXT;
ALTER TABLE care_plans ADD COLUMN branch_id TEXT;
ALTER TABLE risk_assessments ADD COLUMN branch_id TEXT;
ALTER TABLE client_documents ADD COLUMN branch_id TEXT;
UPDATE clients SET branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND branch_id IS NULL;
UPDATE staff SET branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND branch_id IS NULL;
UPDATE care_plans SET branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND branch_id IS NULL;
UPDATE risk_assessments SET branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND branch_id IS NULL;
UPDATE client_documents SET branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND branch_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_tenant_branch ON clients(organisation_id,branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_tenant_branch ON staff(organisation_id,branch_id);
CREATE INDEX IF NOT EXISTS idx_care_plans_tenant_branch ON care_plans(organisation_id,branch_id);

ALTER TABLE sessions ADD COLUMN active_branch_id TEXT;
ALTER TABLE sessions ADD COLUMN switched_by_platform_user INTEGER NOT NULL DEFAULT 0;
UPDATE sessions SET active_branch_id='branch-demo-main' WHERE organisation_id='org-demo' AND active_branch_id IS NULL;
