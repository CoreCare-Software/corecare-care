PRAGMA foreign_keys = ON;

-- Line managers are authorised user accounts rather than only staff records.
-- This allows organisation owners and managers who do not have a duplicate
-- staff profile to supervise care workers while retaining the legacy link.
ALTER TABLE staff ADD COLUMN line_manager_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

UPDATE staff
SET line_manager_user_id=(
  SELECT u.id
  FROM users u
  WHERE u.organisation_id=staff.organisation_id
    AND u.staff_id=staff.line_manager_staff_id
    AND u.status='active'
    AND u.access_level IN ('organisation_owner','area_manager','organisation_admin','deputy_manager','branch_manager','office_staff','senior_carer')
  LIMIT 1
)
WHERE line_manager_staff_id IS NOT NULL
  AND line_manager_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_org_line_manager_user
ON staff(organisation_id,line_manager_user_id,status);

CREATE TRIGGER IF NOT EXISTS tenant_guard_staff_line_manager_insert
BEFORE INSERT ON staff
WHEN NEW.line_manager_user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id=NEW.line_manager_user_id
    AND u.organisation_id=NEW.organisation_id
    AND u.status='active'
    AND u.access_level IN ('organisation_owner','area_manager','organisation_admin','deputy_manager','branch_manager','office_staff','senior_carer')
)
BEGIN
  SELECT RAISE(ABORT,'TENANT_BOUNDARY: staff line manager');
END;

CREATE TRIGGER IF NOT EXISTS tenant_guard_staff_line_manager_update
BEFORE UPDATE OF line_manager_user_id,organisation_id ON staff
WHEN NEW.line_manager_user_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM users u
  WHERE u.id=NEW.line_manager_user_id
    AND u.organisation_id=NEW.organisation_id
    AND u.status='active'
    AND u.access_level IN ('organisation_owner','area_manager','organisation_admin','deputy_manager','branch_manager','office_staff','senior_carer')
    AND (u.staff_id IS NULL OR u.staff_id<>NEW.id)
)
BEGIN
  SELECT RAISE(ABORT,'TENANT_BOUNDARY: staff line manager');
END;
