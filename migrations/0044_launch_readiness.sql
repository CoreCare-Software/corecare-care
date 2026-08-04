PRAGMA foreign_keys = ON;

-- CoreCare Care 1.34.0 — launch-readiness safeguards.

-- Do not retain policy flags for authentication methods that are not implemented.
UPDATE organisation_security_policies
SET require_mfa = 0,
    require_trusted_device = 0,
    allow_password_login = 1,
    updated_at = CURRENT_TIMESTAMP;
ALTER TABLE organisation_security_policies ADD COLUMN require_independent_care_plan_approval INTEGER NOT NULL DEFAULT 1;

-- Make operational handovers branch-aware and retain existing ownership where possible.
ALTER TABLE shift_handovers ADD COLUMN branch_id TEXT;
ALTER TABLE rota_generation_runs ADD COLUMN branch_id TEXT;
UPDATE shift_handovers
SET branch_id = (
  SELECT u.home_branch_id
  FROM users u
  WHERE u.id = shift_handovers.created_by
    AND u.organisation_id = shift_handovers.organisation_id
)
WHERE branch_id IS NULL;
UPDATE rota_generation_runs
SET branch_id = (
  SELECT u.home_branch_id
  FROM users u
  WHERE u.id = rota_generation_runs.generated_by
    AND u.organisation_id = rota_generation_runs.organisation_id
)
WHERE branch_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_shift_handovers_branch
ON shift_handovers(organisation_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rota_generation_runs_branch
ON rota_generation_runs(organisation_id, branch_id, generated_at DESC);

-- Expiring visit verification codes reduce the lifetime of a copied QR code.
ALTER TABLE client_visit_codes ADD COLUMN expires_at TEXT;
ALTER TABLE client_visit_codes ADD COLUMN last_used_at TEXT;
UPDATE client_visit_codes
SET expires_at = datetime('now', '+90 days')
WHERE active = 1 AND expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visit_codes_expiry
ON client_visit_codes(organisation_id, client_id, active, expires_at);

-- Medication authorisation and controlled-drug witness evidence.
ALTER TABLE medications ADD COLUMN prescriber_name TEXT NOT NULL DEFAULT '';
ALTER TABLE medications ADD COLUMN pharmacy_name TEXT NOT NULL DEFAULT '';
ALTER TABLE medications ADD COLUMN authorisation_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE medications ADD COLUMN controlled_drug INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medications ADD COLUMN requires_witness INTEGER NOT NULL DEFAULT 0;
ALTER TABLE medication_administrations ADD COLUMN witness_user_id TEXT;
ALTER TABLE medication_administrations ADD COLUMN witness_name TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_mar_witness
ON medication_administrations(organisation_id, witness_user_id, administered_at);

-- Link body-map escalation and strengthen incident closure evidence.
ALTER TABLE body_map_records ADD COLUMN linked_incident_id TEXT;
ALTER TABLE operations_incidents ADD COLUMN duty_of_candour_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE operations_incidents ADD COLUMN duty_of_candour_completed_at TEXT;
ALTER TABLE operations_incidents ADD COLUMN closure_rationale TEXT NOT NULL DEFAULT '';

-- Family access must retain the authority/consent basis used by the provider.
ALTER TABLE family_client_access ADD COLUMN consent_basis TEXT NOT NULL DEFAULT '';
ALTER TABLE family_client_access ADD COLUMN consent_recorded_at TEXT;
ALTER TABLE family_client_access ADD COLUMN consent_recorded_by TEXT;

-- Private document objects are stored in R2; D1 retains searchable metadata only.
ALTER TABLE client_documents ADD COLUMN storage_key TEXT;
ALTER TABLE client_documents ADD COLUMN original_file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE client_documents ADD COLUMN mime_type TEXT NOT NULL DEFAULT '';
ALTER TABLE client_documents ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_client_documents_storage
ON client_documents(organisation_id, storage_key);

-- Reconcile historical branch values to the client record, which is the source of truth.
UPDATE care_plans
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = care_plans.client_id AND c.organisation_id = care_plans.organisation_id)
WHERE client_id IS NOT NULL;
UPDATE risk_assessments
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = risk_assessments.client_id AND c.organisation_id = risk_assessments.organisation_id)
WHERE client_id IS NOT NULL;
UPDATE client_documents
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = client_documents.client_id AND c.organisation_id = client_documents.organisation_id)
WHERE client_id IS NOT NULL;
UPDATE care_visits
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = care_visits.client_id AND c.organisation_id = care_visits.organisation_id)
WHERE client_id IS NOT NULL;
UPDATE operations_tasks
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = operations_tasks.client_id AND c.organisation_id = operations_tasks.organisation_id)
WHERE client_id IS NOT NULL;
UPDATE operations_incidents
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = operations_incidents.client_id AND c.organisation_id = operations_incidents.organisation_id)
WHERE client_id IS NOT NULL;
UPDATE finance_invoices
SET branch_id = (SELECT c.branch_id FROM clients c WHERE c.id = finance_invoices.client_id AND c.organisation_id = finance_invoices.organisation_id)
WHERE client_id IS NOT NULL;

-- Database-level branch alignment beneath the API checks.
CREATE TRIGGER IF NOT EXISTS branch_guard_care_plan_insert
BEFORE INSERT ON care_plans
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: care plan'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_care_plan_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON care_plans
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: care plan'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_risk_insert
BEFORE INSERT ON risk_assessments
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: risk assessment'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_risk_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON risk_assessments
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: risk assessment'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_document_insert
BEFORE INSERT ON client_documents
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: client document'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_document_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON client_documents
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: client document'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_visit_insert
BEFORE INSERT ON care_visits
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: care visit'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_visit_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON care_visits
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: care visit'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_task_insert
BEFORE INSERT ON operations_tasks
WHEN NEW.client_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: operations task'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_task_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON operations_tasks
WHEN NEW.client_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: operations task'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_incident_insert
BEFORE INSERT ON operations_incidents
WHEN NEW.client_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: incident'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_incident_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON operations_incidents
WHEN NEW.client_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: incident'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_finance_invoice_insert
BEFORE INSERT ON finance_invoices
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: finance invoice'); END;

CREATE TRIGGER IF NOT EXISTS branch_guard_finance_invoice_update
BEFORE UPDATE OF organisation_id, client_id, branch_id ON finance_invoices
WHEN EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
    AND COALESCE(c.branch_id, '') <> COALESCE(NEW.branch_id, '')
)
BEGIN SELECT RAISE(ABORT, 'BRANCH_BOUNDARY: finance invoice'); END;
