-- CoreCare Care 2.0.4: permanent printed client verification QR codes.
-- Active codes remain assigned to one organisation/client until an authorised
-- manager deliberately regenerates them. Revoked codes are retained for audit.
DROP INDEX IF EXISTS idx_visit_code_client_active;
DROP INDEX IF EXISTS idx_visit_codes_expiry;
CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_code_client_active
ON client_visit_codes(organisation_id,client_id)
WHERE active=1;

UPDATE client_visit_codes
SET expires_at=NULL
WHERE active=1;

CREATE TRIGGER IF NOT EXISTS tenant_guard_client_visit_code_insert
BEFORE INSERT ON client_visit_codes
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT,'TENANT_BOUNDARY: client visit code');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_client_visit_code_update
BEFORE UPDATE OF organisation_id,client_id ON client_visit_codes
WHEN NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE c.id=NEW.client_id AND c.organisation_id=NEW.organisation_id
)
BEGIN
  SELECT RAISE(ABORT,'TENANT_BOUNDARY: client visit code');
END;
