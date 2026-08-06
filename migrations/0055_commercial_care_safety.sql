PRAGMA foreign_keys = ON;

-- CoreCare Care 2.0.0 - commercial care-safety, quality and clinical assurance.

ALTER TABLE care_visits ADD COLUMN carers_required INTEGER NOT NULL DEFAULT 1 CHECK(carers_required BETWEEN 1 AND 4);
ALTER TABLE care_visits ADD COLUMN allocation_state TEXT NOT NULL DEFAULT 'unallocated' CHECK(allocation_state IN ('unallocated','partial','ready','exception'));
ALTER TABLE care_visits ADD COLUMN exception_state TEXT NOT NULL DEFAULT 'none' CHECK(exception_state IN ('none','late','critical_late','missed','covered','closed'));
ALTER TABLE care_visits ADD COLUMN late_after_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE care_visits ADD COLUMN missed_after_minutes INTEGER NOT NULL DEFAULT 60;

CREATE TABLE IF NOT EXISTS visit_staff_assignments (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  visit_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  assignment_role TEXT NOT NULL DEFAULT 'support' CHECK(assignment_role IN ('lead','support')),
  allocation_status TEXT NOT NULL DEFAULT 'allocated' CHECK(allocation_status IN ('allocated','accepted','declined','removed','exception')),
  allocation_version INTEGER NOT NULL DEFAULT 1,
  actual_start TEXT,
  actual_end TEXT,
  clock_in_method TEXT,
  clock_out_method TEXT,
  short_team_reason TEXT,
  allocated_by TEXT,
  allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,visit_id,staff_id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (visit_id) REFERENCES care_visits(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT,
  FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_assignments_visit ON visit_staff_assignments(organisation_id,visit_id,allocation_status);
CREATE INDEX IF NOT EXISTS idx_visit_assignments_staff ON visit_staff_assignments(organisation_id,staff_id,allocation_status,actual_start,actual_end);

INSERT OR IGNORE INTO visit_staff_assignments(id,organisation_id,branch_id,visit_id,staff_id,assignment_role,allocation_status,allocated_by,allocated_at)
SELECT 'legacy:' || id,organisation_id,branch_id,id,staff_id,'lead','allocated',created_by,created_at
FROM care_visits WHERE staff_id IS NOT NULL;

UPDATE care_visits SET carers_required=COALESCE((SELECT r.carers_required FROM client_visit_requirements r WHERE r.id=care_visits.requirement_id AND r.organisation_id=care_visits.organisation_id),1);
UPDATE care_visits SET allocation_state=CASE WHEN staff_id IS NULL THEN 'unallocated' WHEN carers_required>1 THEN 'partial' ELSE 'ready' END;

CREATE TABLE IF NOT EXISTS visit_assignment_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('clock_in','clock_out','manager_override')),
  device_event_id TEXT NOT NULL,
  device_time TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'online' CHECK(source IN ('online','offline','manager')),
  reason TEXT,
  recorded_by TEXT,
  UNIQUE(organisation_id,device_event_id),
  FOREIGN KEY (visit_id) REFERENCES care_visits(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES visit_staff_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT,
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assignment_events_visit ON visit_assignment_events(organisation_id,visit_id,received_at);

CREATE TABLE IF NOT EXISTS visit_exceptions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  visit_id TEXT NOT NULL,
  exception_type TEXT NOT NULL CHECK(exception_type IN ('late','critical_late','missed','short_team','competency','absence','travel','clocking')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('information','warning','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','covered','resolved','closed')),
  summary TEXT NOT NULL,
  owner_user_id TEXT,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  resolution TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,visit_id,exception_type,status),
  FOREIGN KEY (visit_id) REFERENCES care_visits(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_exceptions_open ON visit_exceptions(organisation_id,status,severity,created_at DESC);

ALTER TABLE medications ADD COLUMN indication TEXT;
ALTER TABLE medications ADD COLUMN gp_name TEXT;
ALTER TABLE medications ADD COLUMN review_date TEXT;
ALTER TABLE medications ADD COLUMN dose_units_per_administration REAL;
ALTER TABLE medications ADD COLUMN max_dose_units_24h REAL;
ALTER TABLE medications ADD COLUMN dose_unit TEXT;
ALTER TABLE medications ADD COLUMN time_critical INTEGER NOT NULL DEFAULT 0 CHECK(time_critical IN (0,1));
ALTER TABLE medications ADD COLUMN self_administration_status TEXT NOT NULL DEFAULT 'staff_administered' CHECK(self_administration_status IN ('staff_administered','prompted','supervised','self_administered','family_administered'));
ALTER TABLE medications ADD COLUMN covert_medication INTEGER NOT NULL DEFAULT 0 CHECK(covert_medication IN (0,1));
ALTER TABLE medications ADD COLUMN covert_authorisation_id TEXT;
ALTER TABLE medications ADD COLUMN reconciliation_status TEXT NOT NULL DEFAULT 'not_recorded' CHECK(reconciliation_status IN ('not_recorded','pending','verified','discrepancy'));
ALTER TABLE medications ADD COLUMN reconciled_at TEXT;
ALTER TABLE medication_administrations ADD COLUMN allergy_snapshot_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE medication_administrations ADD COLUMN allergy_checked_at TEXT;
ALTER TABLE medication_administrations ADD COLUMN administration_mode TEXT NOT NULL DEFAULT 'staff' CHECK(administration_mode IN ('staff','prompted','supervised','self','family','covert'));
ALTER TABLE medication_administrations ADD COLUMN dose_units REAL;
ALTER TABLE medication_administrations ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mar_idempotency ON medication_administrations(organisation_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_allergy_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  substance TEXT NOT NULL,
  reaction TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'unknown' CHECK(severity IN ('unknown','mild','moderate','severe','life_threatening')),
  verification_status TEXT NOT NULL DEFAULT 'reported' CHECK(verification_status IN ('reported','verified','entered_in_error','inactive')),
  verified_by TEXT,
  verified_at TEXT,
  review_date TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_allergies_active ON client_allergy_records(organisation_id,client_id,verification_status);

CREATE TABLE IF NOT EXISTS medication_support_assessments (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  medication_id TEXT,
  support_level TEXT NOT NULL CHECK(support_level IN ('independent','prompt','assist','administer','covert')),
  assessment TEXT NOT NULL,
  risks_controls TEXT NOT NULL,
  consent_status TEXT NOT NULL,
  assessed_by TEXT,
  assessed_at TEXT NOT NULL,
  review_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','superseded','expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_med_support_client ON medication_support_assessments(organisation_id,client_id,status,review_date);

CREATE TABLE IF NOT EXISTS medication_supply_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK(record_type IN ('order','receipt','return','waste','disposal','reconciliation','discrepancy')),
  quantity REAL,
  batch_number TEXT,
  expiry_date TEXT,
  supplier TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status IN ('planned','ordered','received','recorded','resolved','cancelled')),
  reason TEXT,
  witnessed_by TEXT,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_med_supply_client ON medication_supply_records(organisation_id,client_id,medication_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS client_governance_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK(record_type IN ('capacity_assessment','best_interest_decision','lpa','deputyship','dnacpr','advance_decision','restrictive_practice','restriction_authorisation','covert_medication','end_of_life_preference')),
  title TEXT NOT NULL,
  decision_scope TEXT NOT NULL,
  outcome TEXT NOT NULL,
  rationale TEXT NOT NULL,
  participants_json TEXT NOT NULL DEFAULT '[]',
  legal_authority TEXT,
  evidence_reference TEXT,
  effective_from TEXT,
  review_date TEXT NOT NULL,
  expires_at TEXT,
  prominent_alert INTEGER NOT NULL DEFAULT 0 CHECK(prominent_alert IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','superseded','expired','revoked')),
  recorded_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_governance_current ON client_governance_records(organisation_id,client_id,record_type,status,review_date);

CREATE TABLE IF NOT EXISTS client_communication_profiles (
  client_id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  preferred_language TEXT NOT NULL DEFAULT 'English',
  communication_method TEXT NOT NULL DEFAULT 'spoken',
  interpreter_required INTEGER NOT NULL DEFAULT 0 CHECK(interpreter_required IN (0,1)),
  interpreter_details TEXT,
  accessible_formats_json TEXT NOT NULL DEFAULT '[]',
  hearing_support TEXT,
  vision_support TEXT,
  cognitive_support TEXT,
  contact_preferences TEXT,
  adjustments TEXT NOT NULL,
  consent_to_share INTEGER NOT NULL DEFAULT 0 CHECK(consent_to_share IN (0,1)),
  prominent_flag TEXT,
  verified_by TEXT,
  verified_at TEXT,
  review_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_feedback_cases (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT,
  case_reference TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK(case_type IN ('complaint','compliment','concern','suggestion','whistleblowing')),
  channel TEXT NOT NULL DEFAULT 'direct',
  reporter_name TEXT NOT NULL,
  reporter_contact TEXT,
  reporter_user_id TEXT,
  relationship TEXT,
  accessible_support TEXT,
  consent_to_contact INTEGER NOT NULL DEFAULT 1 CHECK(consent_to_contact IN (0,1)),
  summary TEXT NOT NULL,
  immediate_action TEXT,
  risk_level TEXT NOT NULL DEFAULT 'standard' CHECK(risk_level IN ('standard','high','critical')),
  owner_user_id TEXT,
  acknowledgement_due_at TEXT,
  acknowledged_at TEXT,
  response_due_at TEXT,
  response_sent_at TEXT,
  investigation_summary TEXT,
  outcome TEXT,
  lessons_learned TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','investigating','response_due','resolved','closed','withdrawn')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,case_reference),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_cases_open ON service_feedback_cases(organisation_id,status,response_due_at,risk_level);

CREATE TABLE IF NOT EXISTS feedback_communications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  feedback_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound','internal')),
  method TEXT NOT NULL,
  summary TEXT NOT NULL,
  shared_with_reporter INTEGER NOT NULL DEFAULT 0 CHECK(shared_with_reporter IN (0,1)),
  recorded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feedback_id) REFERENCES service_feedback_cases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_feedback_comms_case ON feedback_communications(organisation_id,feedback_id,created_at);

CREATE TABLE IF NOT EXISTS quality_audits (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  audit_reference TEXT NOT NULL,
  audit_type TEXT NOT NULL,
  title TEXT NOT NULL,
  scope TEXT NOT NULL,
  standard_reference TEXT,
  score_percent INTEGER CHECK(score_percent BETWEEN 0 AND 100),
  outcome TEXT NOT NULL DEFAULT 'in_progress' CHECK(outcome IN ('in_progress','compliant','partial','non_compliant','not_applicable')),
  findings TEXT,
  strengths TEXT,
  immediate_containment TEXT,
  root_cause TEXT,
  owner_user_id TEXT,
  scheduled_for TEXT,
  completed_at TEXT,
  effectiveness_review_at TEXT,
  independently_closed_by TEXT,
  closed_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','actions_required','effectiveness_review','closed','cancelled')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,audit_reference)
);
CREATE INDEX IF NOT EXISTS idx_quality_audits_status ON quality_audits(organisation_id,status,scheduled_for);

CREATE TABLE IF NOT EXISTS quality_actions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN ('audit','complaint','incident','medication','visit','care_plan','workforce','other')),
  source_id TEXT,
  action_type TEXT NOT NULL DEFAULT 'corrective' CHECK(action_type IN ('containment','correction','corrective','preventive','improvement')),
  title TEXT NOT NULL,
  action_required TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  owner_user_id TEXT,
  due_at TEXT NOT NULL,
  completed_at TEXT,
  effectiveness_evidence TEXT,
  effectiveness_outcome TEXT CHECK(effectiveness_outcome IS NULL OR effectiveness_outcome IN ('effective','partly_effective','ineffective')),
  verified_by TEXT,
  verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','effectiveness_review','verified','cancelled')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quality_actions_due ON quality_actions(organisation_id,status,due_at,priority);

CREATE TABLE IF NOT EXISTS client_journey_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('enquiry','referral','pre_assessment','accepted','waitlist','admission','service_change','hospital','return_home','suspension','discharge','deceased','funding_review')),
  event_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('planned','in_progress','completed','cancelled')),
  source TEXT,
  funding_body TEXT,
  service_agreement_reference TEXT,
  summary TEXT NOT NULL,
  handover TEXT,
  recorded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_journey ON client_journey_events(organisation_id,client_id,event_at DESC);

CREATE TABLE IF NOT EXISTS clinical_observations (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT NOT NULL,
  visit_id TEXT,
  observation_type TEXT NOT NULL CHECK(observation_type IN ('blood_pressure','pulse','temperature','oxygen_saturation','respiratory_rate','blood_glucose','weight','pain','fluid_intake','nutrition','bowel','continence','behaviour_abc','repositioning','wound','skin','other')),
  observed_at TEXT NOT NULL,
  value_numeric REAL,
  value_secondary REAL,
  value_text TEXT,
  unit TEXT,
  target_min REAL,
  target_max REAL,
  escalation_required INTEGER NOT NULL DEFAULT 0 CHECK(escalation_required IN (0,1)),
  escalation_action TEXT,
  body_map_record_id TEXT,
  recorded_by TEXT,
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (visit_id) REFERENCES care_visits(id) ON DELETE SET NULL,
  FOREIGN KEY (body_map_record_id) REFERENCES body_map_records(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_clinical_observations_client ON clinical_observations(organisation_id,client_id,observation_type,observed_at DESC);

CREATE TABLE IF NOT EXISTS offline_submission_receipts (
  idempotency_key TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  entity_id TEXT,
  device_time TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_offline_receipts_user ON offline_submission_receipts(organisation_id,user_id,received_at DESC);

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('quality.view','Quality assurance','View quality assurance','View complaints, audits, actions and provider assurance evidence.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('quality.manage','Quality assurance','Manage quality assurance','Record complaints, audits, corrective actions and effectiveness reviews.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('quality.approve','Quality assurance','Approve quality closure','Independently verify and close quality actions and audits.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('clinical_governance.view','Clinical governance','View clinical governance','View capacity, authority, advance decisions and accessible-information records.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('clinical_governance.manage','Clinical governance','Manage clinical governance','Create and maintain clinical, legal-authority and accessible-information records.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('observations.view','Clinical observations','View clinical observations','View longitudinal observations and escalation evidence.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('observations.manage','Clinical observations','Record clinical observations','Record observations and escalation actions within authorised care.','high');
INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled) SELECT id,'quality',1 FROM organisations;

CREATE TRIGGER IF NOT EXISTS tenant_guard_visit_assignment_insert BEFORE INSERT ON visit_staff_assignments
WHEN NOT EXISTS (SELECT 1 FROM care_visits v WHERE v.id=NEW.visit_id AND v.organisation_id=NEW.organisation_id AND COALESCE(v.branch_id,'')=COALESCE(NEW.branch_id,''))
  OR NOT EXISTS (SELECT 1 FROM staff s WHERE s.id=NEW.staff_id AND s.organisation_id=NEW.organisation_id AND COALESCE(s.branch_id,'')=COALESCE(NEW.branch_id,''))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: visit assignment'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_visit_assignment_update BEFORE UPDATE ON visit_staff_assignments
WHEN NEW.organisation_id<>OLD.organisation_id OR NEW.visit_id<>OLD.visit_id OR NEW.staff_id<>OLD.staff_id
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: visit assignment immutable scope'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_allergy_insert BEFORE INSERT ON client_allergy_records
WHEN NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: allergy client'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_governance_insert BEFORE INSERT ON client_governance_records
WHEN NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id AND COALESCE(c.branch_id,'')=COALESCE(NEW.branch_id,''))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: governance client'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_feedback_insert BEFORE INSERT ON service_feedback_cases
WHEN NEW.client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: feedback client'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_observation_insert BEFORE INSERT ON clinical_observations
WHEN NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id AND COALESCE(c.branch_id,'')=COALESCE(NEW.branch_id,''))
  OR (NEW.visit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM care_visits v WHERE v.id=NEW.visit_id AND v.client_id=NEW.client_id AND v.organisation_id=NEW.organisation_id))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: clinical observation'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_medication_insert BEFORE INSERT ON medications
WHEN NOT EXISTS (SELECT 1 FROM clients c WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: medication client'); END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_medication_admin_insert BEFORE INSERT ON medication_administrations
WHEN NOT EXISTS (SELECT 1 FROM medications m WHERE m.id=NEW.medication_id AND m.client_id=NEW.client_id AND m.organisation_id=NEW.organisation_id)
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: medication administration'); END;
