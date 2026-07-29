PRAGMA foreign_keys = ON;

ALTER TABLE care_visits ADD COLUMN planner_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE care_visits ADD COLUMN planner_notes TEXT NOT NULL DEFAULT '';

INSERT OR IGNORE INTO permission_catalog(permission_key,name,description,category,risk_level) VALUES('rota.visit.lock','Lock and unlock rota visits','Prevent accidental planner changes and permit authorised unlocking.','Rota','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,name,description,category,risk_level) VALUES('rota.visit.override_lock','Override locked rota visits','Permit an authorised planner or manager to change a locked visit.','Rota','high');
