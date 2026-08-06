PRAGMA foreign_keys = ON;

-- CoreCare Care workforce hub. This migration intentionally applies only to the
-- Care product database and preserves every existing staff record.

ALTER TABLE staff ADD COLUMN employee_number TEXT;
ALTER TABLE staff ADD COLUMN line_manager_staff_id TEXT;
ALTER TABLE staff ADD COLUMN contracted_hours REAL;
ALTER TABLE staff ADD COLUMN work_location TEXT;
ALTER TABLE staff ADD COLUMN probation_end_date TEXT;
ALTER TABLE staff ADD COLUMN end_date TEXT;
ALTER TABLE staff ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE staff ADD COLUMN emergency_contact_relationship TEXT;
ALTER TABLE staff ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE staff ADD COLUMN supervision_frequency_days INTEGER;
ALTER TABLE staff ADD COLUMN next_supervision_date TEXT;
ALTER TABLE staff ADD COLUMN next_appraisal_date TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_org_employee_number
ON staff(organisation_id, employee_number)
WHERE employee_number IS NOT NULL AND employee_number <> '';

CREATE INDEX IF NOT EXISTS idx_staff_org_manager
ON staff(organisation_id, line_manager_staff_id, status);

CREATE TABLE IF NOT EXISTS organisation_workforce_settings (
  organisation_id TEXT PRIMARY KEY,
  supervision_frequency_days INTEGER NOT NULL DEFAULT 30,
  new_starter_supervision_days INTEGER NOT NULL DEFAULT 7,
  appraisal_frequency_days INTEGER NOT NULL DEFAULT 365,
  expiry_warning_days INTEGER NOT NULL DEFAULT 60,
  probation_review_days INTEGER NOT NULL DEFAULT 90,
  require_staff_acknowledgement INTEGER NOT NULL DEFAULT 1 CHECK(require_staff_acknowledgement IN (0,1)),
  block_expired_critical_competencies INTEGER NOT NULL DEFAULT 1 CHECK(block_expired_critical_competencies IN (0,1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO organisation_workforce_settings(organisation_id)
SELECT id FROM organisations;

CREATE TABLE IF NOT EXISTS staff_recruitment_checks (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK(check_type IN ('identity','right_to_work','dbs','reference','employment_history','qualification','professional_registration','health_declaration','interview','other')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','concern','expired','not_required')),
  checked_at TEXT,
  expiry_date TEXT,
  reference TEXT,
  verified_by TEXT,
  outcome TEXT,
  notes TEXT,
  restricted INTEGER NOT NULL DEFAULT 0 CHECK(restricted IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_recruitment_staff
ON staff_recruitment_checks(organisation_id, staff_id, check_type, status);
CREATE INDEX IF NOT EXISTS idx_staff_recruitment_expiry
ON staff_recruitment_checks(organisation_id, expiry_date, status);

CREATE TABLE IF NOT EXISTS staff_employment_history (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  employer_name TEXT NOT NULL,
  job_title TEXT,
  started_on TEXT,
  ended_on TEXT,
  reason_for_leaving TEXT,
  gap_explanation TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  verified_by TEXT,
  verified_at TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_employment_history_staff
ON staff_employment_history(organisation_id, staff_id, started_on, ended_on);

CREATE TABLE IF NOT EXISTS staff_supervisions (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  supervisor_staff_id TEXT,
  meeting_type TEXT NOT NULL DEFAULT 'formal' CHECK(meeting_type IN ('formal','probation','return_to_work','clinical','competency','wellbeing','ad_hoc')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('draft','planned','completed','cancelled','missed')),
  scheduled_at TEXT NOT NULL,
  completed_at TEXT,
  location TEXT,
  wellbeing_rating INTEGER CHECK(wellbeing_rating IS NULL OR wellbeing_rating BETWEEN 1 AND 5),
  agenda TEXT,
  reflective_discussion TEXT,
  performance_summary TEXT,
  safeguarding_discussion TEXT,
  incidents_discussion TEXT,
  training_discussion TEXT,
  support_required TEXT,
  agreed_outcomes TEXT,
  actions_json TEXT NOT NULL DEFAULT '[]',
  next_supervision_date TEXT,
  manager_signed_by TEXT,
  manager_signed_at TEXT,
  staff_acknowledged_by TEXT,
  staff_acknowledged_at TEXT,
  staff_comments TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (supervisor_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_signed_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (staff_acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_supervisions_staff
ON staff_supervisions(organisation_id, staff_id, scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_staff_supervisions_due
ON staff_supervisions(organisation_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS staff_training_catalog (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Core skills',
  description TEXT,
  requirement_level TEXT NOT NULL DEFAULT 'role' CHECK(requirement_level IN ('core','role','optional')),
  role_scope_json TEXT NOT NULL DEFAULT '["all"]',
  renewal_months INTEGER,
  evidence_required INTEGER NOT NULL DEFAULT 1 CHECK(evidence_required IN (0,1)),
  critical_for_allocation INTEGER NOT NULL DEFAULT 0 CHECK(critical_for_allocation IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id, name),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_training_catalog_org
ON staff_training_catalog(organisation_id, active, requirement_level, category);

CREATE TABLE IF NOT EXISTS staff_training_records (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  training_catalog_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','booked','in_progress','completed','failed','expired','exempt')),
  assigned_at TEXT,
  required_by TEXT,
  booked_for TEXT,
  completed_date TEXT,
  expiry_date TEXT,
  provider TEXT,
  certificate_reference TEXT,
  result TEXT,
  assessor_name TEXT,
  competency_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(competency_confirmed IN (0,1)),
  exemption_reason TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id, staff_id, training_catalog_id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (training_catalog_id) REFERENCES staff_training_catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_training_staff
ON staff_training_records(organisation_id, staff_id, status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_staff_training_expiry
ON staff_training_records(organisation_id, expiry_date, status);

CREATE TABLE IF NOT EXISTS staff_competencies (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Care practice',
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','observed','competent','development_required','restricted','expired')),
  critical_for_allocation INTEGER NOT NULL DEFAULT 0 CHECK(critical_for_allocation IN (0,1)),
  assessed_at TEXT,
  expiry_date TEXT,
  assessor_name TEXT,
  observation TEXT,
  outcome TEXT,
  restrictions TEXT,
  next_review_date TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_competencies_staff
ON staff_competencies(organisation_id, staff_id, status, expiry_date);

CREATE TABLE IF NOT EXISTS staff_qualifications (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  name TEXT NOT NULL,
  qualification_level TEXT,
  awarding_body TEXT,
  registration_number TEXT,
  status TEXT NOT NULL DEFAULT 'current' CHECK(status IN ('studying','current','expired','suspended','archived')),
  issued_date TEXT,
  expiry_date TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  verified_by TEXT,
  verified_at TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_qualifications_staff
ON staff_qualifications(organisation_id, staff_id, status, expiry_date);

CREATE TABLE IF NOT EXISTS staff_appraisals (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  manager_staff_id TEXT,
  appraisal_type TEXT NOT NULL DEFAULT 'annual' CHECK(appraisal_type IN ('annual','probation','development','performance','career')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('draft','planned','completed','cancelled')),
  period_start TEXT,
  period_end TEXT,
  scheduled_at TEXT NOT NULL,
  completed_at TEXT,
  performance_rating INTEGER CHECK(performance_rating IS NULL OR performance_rating BETWEEN 1 AND 5),
  performance_summary TEXT,
  achievements TEXT,
  strengths TEXT,
  objectives_json TEXT NOT NULL DEFAULT '[]',
  development_plan TEXT,
  career_aspirations TEXT,
  staff_comments TEXT,
  next_appraisal_date TEXT,
  manager_signed_by TEXT,
  manager_signed_at TEXT,
  staff_acknowledged_by TEXT,
  staff_acknowledged_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (manager_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_signed_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (staff_acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_appraisals_staff
ON staff_appraisals(organisation_id, staff_id, scheduled_at, status);

CREATE TABLE IF NOT EXISTS staff_absences (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  absence_type TEXT NOT NULL DEFAULT 'sickness' CHECK(absence_type IN ('sickness','authorised','unpaid','family','bereavement','medical','other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('planned','open','closed','cancelled')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  reason_summary TEXT,
  fit_note_required INTEGER NOT NULL DEFAULT 0 CHECK(fit_note_required IN (0,1)),
  fit_note_received INTEGER NOT NULL DEFAULT 0 CHECK(fit_note_received IN (0,1)),
  return_to_work_required INTEGER NOT NULL DEFAULT 1 CHECK(return_to_work_required IN (0,1)),
  return_to_work_completed_at TEXT,
  return_to_work_notes TEXT,
  restricted INTEGER NOT NULL DEFAULT 1 CHECK(restricted IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_absences_staff
ON staff_absences(organisation_id, staff_id, started_at, status);

CREATE TABLE IF NOT EXISTS staff_hr_cases (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK(case_type IN ('capability','disciplinary','grievance','safeguarding','conduct','complaint','other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','hearing','action_plan','closed','appealed')),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  summary TEXT NOT NULL,
  actions_taken TEXT,
  outcome TEXT,
  owner_user_id TEXT,
  restricted INTEGER NOT NULL DEFAULT 1 CHECK(restricted IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id, reference_number),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_hr_cases_staff
ON staff_hr_cases(organisation_id, staff_id, status, opened_at);

CREATE TABLE IF NOT EXISTS staff_documents (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('identity','right_to_work','reference','qualification','training_certificate','professional_registration','employment_contract','fit_note','supervision_evidence','appraisal_evidence','other')),
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'current' CHECK(status IN ('current','expired','archived')),
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK(sensitive IN (0,1)),
  retention_until TEXT,
  storage_key TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  notes TEXT,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_documents_staff
ON staff_documents(organisation_id, staff_id, status, expiry_date);

CREATE TABLE IF NOT EXISTS staff_record_events (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_record_events_staff
ON staff_record_events(organisation_id, staff_id, created_at);

-- Configurable starting catalogue. Providers can amend applicability and renewal
-- periods to match their service, workforce roles and local policy.
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:care-certificate',id,'Care Certificate','Induction','Role induction and assessed Care Certificate standards.','role','["care"]',NULL,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:safeguarding-adults',id,'Safeguarding adults','Safety','Recognising, responding to and reporting abuse or neglect.','core','["all"]',12,1,1 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:medication',id,'Medication administration and competency','Clinical','Medication support, administration, recording and competency assessment.','role','["care","clinical"]',12,1,1 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:moving-handling',id,'Moving and handling','Safety','Safe moving, positioning, equipment and individual risk controls.','role','["care","clinical"]',12,1,1 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:infection-control',id,'Infection prevention and control','Safety','Infection prevention, PPE and outbreak controls.','core','["all"]',12,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:first-aid',id,'First aid and basic life support','Safety','Emergency response appropriate to the worker role.','role','["care","clinical"]',12,1,1 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:mca-dols',id,'Mental Capacity Act and least-restrictive practice','Care practice','Consent, capacity, best interests and least-restrictive support.','role','["care","clinical","management"]',24,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:learning-disability-autism',id,'Learning disability and autism','Care practice','Role-appropriate understanding and interaction skills.','core','["all"]',24,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:health-safety',id,'Health and safety','Safety','Workplace hazards, reporting and safe systems of work.','core','["all"]',24,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:information-governance',id,'Information governance and confidentiality','Governance','Confidentiality, secure records and data protection responsibilities.','core','["all"]',12,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:fire-safety',id,'Fire safety','Safety','Fire prevention, evacuation and local emergency arrangements.','core','["all"]',12,1,0 FROM organisations;
INSERT OR IGNORE INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation)
SELECT id || ':training:equality',id,'Equality, diversity and human rights','Care practice','Inclusive, rights-based and non-discriminatory care practice.','core','["all"]',24,1,0 FROM organisations;

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.records.view','Workforce','View staff compliance records','View recruitment, training, supervision, appraisal and qualification records.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.records.manage','Workforce','Manage staff compliance records','Create and amend workforce compliance records and settings.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.supervision.view','Workforce','View staff supervisions','View formal supervision and agreed actions.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.supervision.manage','Workforce','Manage staff supervisions','Schedule, complete and sign staff supervisions.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.training.view','Workforce','View training and competencies','View training, qualification and competency records.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.training.manage','Workforce','Manage training and competencies','Assign and update training, qualifications and competency assessments.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.documents.view','Workforce','View staff documents','View permitted workforce evidence documents.','sensitive');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.documents.manage','Workforce','Manage staff documents','Upload and archive workforce evidence documents.','high');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.hr.view','Restricted HR','View restricted HR records','View absence, wellbeing, conduct, grievance and safeguarding employment records.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.hr.manage','Restricted HR','Manage restricted HR records','Create and amend absence, wellbeing and restricted employment case records.','critical');
INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level) VALUES ('staff.reports.view','Workforce','View workforce compliance reports','View and export the workforce compliance matrix and inspection evidence.','sensitive');

