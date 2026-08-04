PRAGMA foreign_keys = ON;

-- Organisation-owned launch evidence and authenticated sign-off.
CREATE TABLE IF NOT EXISTS organisation_launch_governance (
  organisation_id TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  owner_name TEXT NOT NULL DEFAULT '',
  owner_role TEXT NOT NULL DEFAULT '',
  evidence_summary TEXT NOT NULL DEFAULT '',
  evidence_reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','ready_for_signoff','approved')),
  approved_by TEXT,
  approved_by_name TEXT,
  approved_by_role TEXT,
  approved_at TEXT,
  review_due_at TEXT,
  declaration_text TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organisation_id, domain_key),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS organisation_launch_governance_checks (
  organisation_id TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  check_key TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  evidence_note TEXT NOT NULL DEFAULT '',
  completed_by TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organisation_id, domain_key, check_key),
  FOREIGN KEY (organisation_id, domain_key) REFERENCES organisation_launch_governance(organisation_id, domain_key) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_launch_governance_status
ON organisation_launch_governance(organisation_id, status, updated_at DESC);

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level)
VALUES ('governance.launch.view','Governance','View launch governance','View launch evidence, readiness and authenticated approvals.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level)
VALUES ('governance.launch.manage','Governance','Manage launch evidence','Maintain owners, evidence references and completion criteria.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level)
VALUES ('governance.launch.approve','Governance','Approve launch evidence','Provide or reopen accountable launch sign-off.','critical');
