PRAGMA foreign_keys = ON;

-- CoreCare Care 1.41.0 - permission-led workforce access and review governance.

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('branches.view','Organisation','View branches','View the organisation branch register.','standard');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('branches.manage','Organisation','Manage branches','Create and update organisation branches.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.create','Visits','Create live visits','Create an operational visit outside the rota planning workflow.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.records.view','Visits','View visit care records','View care delivered, observations and visit outcomes.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.records.manage','Visits','Record visit care','Create and update visit care records for authorised work.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('visits.codes.manage','Visits','Manage visit verification codes','Issue and replace client visit verification codes.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('medication.administer','Medication','Record medicine administration','Record authorised eMAR administrations without changing prescriptions.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('medication.stock.manage','Medication','Manage medicine stock','Record receipts, returns, waste and stock corrections.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('medication.correct','Medication','Correct eMAR records','Make witnessed, audited corrections to medicine administrations.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('tasks.complete','Tasks','Complete assigned tasks','Complete or escalate tasks without managing the task register.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('incidents.create','Incidents','Report incidents','Create an incident or safeguarding concern.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('incidents.review','Incidents','Review incidents','Investigate incidents and record management updates.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('care_plans.approve','Care planning','Approve care plans','Approve a clinically complete care plan independently.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('care_plans.generate_visits','Care planning','Generate care-plan visits','Generate draft rota visits from approved care requirements.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('body_map.view','Care records','View body maps','View body-map concerns and progress records.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('body_map.manage','Care records','Manage body maps','Record and update body-map concerns.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('finance.settings.manage','Finance','Manage finance connection','Change organisation-wide finance settings and external software links.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('reports.export','Reports','Export reports','Export the records contained in operational reports.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('support.tickets.view','Support','View support tickets','View organisation support tickets and replies.','standard');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('support.tickets.manage','Support','Manage support tickets','Create, reply to, close and reopen support tickets.','standard');

CREATE TABLE IF NOT EXISTS user_access_reviews (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('confirmed','changed','disabled')),
  review_summary TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_review_date TEXT NOT NULL,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_user_access_reviews_due
ON user_access_reviews(organisation_id,next_review_date,user_id,reviewed_at DESC);

CREATE TRIGGER IF NOT EXISTS tenant_guard_user_access_review_insert
BEFORE INSERT ON user_access_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id=NEW.user_id AND u.organisation_id=NEW.organisation_id
)
OR NOT EXISTS (
  SELECT 1 FROM users reviewer
  WHERE reviewer.id=NEW.reviewer_id AND reviewer.organisation_id=NEW.organisation_id
)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: user access review'); END;
