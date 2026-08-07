-- CoreCare Care 2.0.3: complete organisation module catalogue and safe defaults.
-- Existing choices are preserved. Missing rows are enabled so no organisation
-- loses access during the upgrade.
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
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'quality',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'finance',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'reports',1 FROM organisations;
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'settings',1 FROM organisations;

-- These records are structural to safe care operation and prevent an
-- administrator accidentally locking the organisation out of its core data.
UPDATE organisation_modules SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE module_key IN ('dashboard','clients','staff','care','settings') AND enabled<>1;
