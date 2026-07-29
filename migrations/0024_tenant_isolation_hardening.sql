PRAGMA foreign_keys = ON;

-- Tenant boundary indexes used by every organisation-scoped lookup.
CREATE INDEX IF NOT EXISTS idx_visit_events_tenant_event ON visit_events(organisation_id, device_event_id);
CREATE INDEX IF NOT EXISTS idx_visit_events_tenant_visit ON visit_events(organisation_id, visit_id, received_at);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_tenant_client ON operations_tasks(organisation_id, client_id);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_tenant_staff ON operations_tasks(organisation_id, assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_operations_incidents_tenant_client ON operations_incidents(organisation_id, client_id);

-- D1 does not provide row-level security, so these triggers act as a second
-- database-level boundary beneath the organisation-scoped API queries.
CREATE TRIGGER IF NOT EXISTS tenant_guard_visit_code_insert
BEFORE INSERT ON client_visit_codes
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: client visit code');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_visit_code_update
BEFORE UPDATE OF organisation_id, client_id ON client_visit_codes
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: client visit code');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_care_visit_insert
BEFORE INSERT ON care_visits
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
) OR (
  NEW.staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = NEW.staff_id AND s.organisation_id = NEW.organisation_id
  )
) OR (
  NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = NEW.branch_id AND b.organisation_id = NEW.organisation_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: care visit');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_care_visit_update
BEFORE UPDATE OF organisation_id, client_id, staff_id, branch_id ON care_visits
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
) OR (
  NEW.staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = NEW.staff_id AND s.organisation_id = NEW.organisation_id
  )
) OR (
  NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = NEW.branch_id AND b.organisation_id = NEW.organisation_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: care visit');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_visit_event_insert
BEFORE INSERT ON visit_events
WHEN NOT EXISTS (
  SELECT 1 FROM care_visits v
  WHERE v.id = NEW.visit_id AND v.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: visit event');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_operations_task_insert
BEFORE INSERT ON operations_tasks
WHEN (
  NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
  )
) OR (
  NEW.assigned_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = NEW.assigned_staff_id AND s.organisation_id = NEW.organisation_id
  )
) OR (
  NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM branches b
    WHERE b.id = NEW.branch_id AND b.organisation_id = NEW.organisation_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: operations task');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_operations_task_update
BEFORE UPDATE OF organisation_id, client_id, assigned_staff_id, branch_id ON operations_tasks
WHEN (
  NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
  )
) OR (
  NEW.assigned_staff_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = NEW.assigned_staff_id AND s.organisation_id = NEW.organisation_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: operations task');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_operations_incident_insert
BEFORE INSERT ON operations_incidents
WHEN NEW.client_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: operations incident');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_operations_incident_update
BEFORE UPDATE OF organisation_id, client_id ON operations_incidents
WHEN NEW.client_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: operations incident');
END;

-- Existing care records also receive database-level cross-tenant protection.
CREATE TRIGGER IF NOT EXISTS tenant_guard_care_plan_insert
BEFORE INSERT ON care_plans
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: care plan');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_risk_insert
BEFORE INSERT ON risk_assessments
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: risk assessment');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_document_insert
BEFORE INSERT ON client_documents
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id = NEW.client_id AND c.organisation_id = NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT, 'TENANT_BOUNDARY: client document');
END;
