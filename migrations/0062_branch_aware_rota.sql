-- CoreCare Care 2.2.0
PRAGMA foreign_keys = ON;

-- Branch-aware rota planning and explicitly governed cross-branch cover.
ALTER TABLE visit_staff_assignments ADD COLUMN home_branch_id TEXT;
ALTER TABLE visit_staff_assignments ADD COLUMN is_cross_branch INTEGER NOT NULL DEFAULT 0 CHECK(is_cross_branch IN (0,1));
ALTER TABLE visit_staff_assignments ADD COLUMN cross_branch_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE care_visits ADD COLUMN published_snapshot_json TEXT NOT NULL DEFAULT '';
ALTER TABLE care_visits ADD COLUMN rota_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notifications ADD COLUMN requires_acknowledgement INTEGER NOT NULL DEFAULT 0 CHECK(requires_acknowledgement IN (0,1));
ALTER TABLE notifications ADD COLUMN branch_id TEXT;
ALTER TABLE notifications ADD COLUMN due_at TEXT;

UPDATE visit_staff_assignments
SET home_branch_id=(SELECT s.branch_id FROM staff s WHERE s.id=visit_staff_assignments.staff_id AND s.organisation_id=visit_staff_assignments.organisation_id),
    is_cross_branch=CASE
      WHEN branch_id IS NOT NULL
       AND (SELECT s.branch_id FROM staff s WHERE s.id=visit_staff_assignments.staff_id AND s.organisation_id=visit_staff_assignments.organisation_id) IS NOT NULL
       AND branch_id<>(SELECT s.branch_id FROM staff s WHERE s.id=visit_staff_assignments.staff_id AND s.organisation_id=visit_staff_assignments.organisation_id)
      THEN 1 ELSE 0 END,
    cross_branch_reason=CASE
      WHEN branch_id IS NOT NULL
       AND (SELECT s.branch_id FROM staff s WHERE s.id=visit_staff_assignments.staff_id AND s.organisation_id=visit_staff_assignments.organisation_id) IS NOT NULL
       AND branch_id<>(SELECT s.branch_id FROM staff s WHERE s.id=visit_staff_assignments.staff_id AND s.organisation_id=visit_staff_assignments.organisation_id)
      THEN 'Existing cross-branch assignment recorded during branch-aware rota migration'
      ELSE '' END;

UPDATE care_visits
SET published_snapshot_json=json_object(
      'branchId',branch_id,
      'clientId',client_id,
      'staffIds',json(COALESCE((
        SELECT json_group_array(a.staff_id)
        FROM visit_staff_assignments a
        WHERE a.organisation_id=care_visits.organisation_id
          AND a.visit_id=care_visits.id
          AND a.allocation_status NOT IN ('removed','declined')
      ),'[]')),
      'visitType',visit_type,
      'scheduledStart',scheduled_start,
      'scheduledEnd',scheduled_end
    )
WHERE COALESCE(rota_status,'published')='published'
  AND status<>'cancelled'
  AND published_snapshot_json='';

DROP TRIGGER IF EXISTS tenant_guard_visit_assignment_insert;
CREATE TRIGGER tenant_guard_visit_assignment_insert BEFORE INSERT ON visit_staff_assignments
WHEN NOT EXISTS (
    SELECT 1 FROM care_visits v
    WHERE v.id=NEW.visit_id
      AND v.organisation_id=NEW.organisation_id
      AND COALESCE(v.branch_id,'')=COALESCE(NEW.branch_id,'')
  )
  OR NOT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id=NEW.staff_id
      AND s.organisation_id=NEW.organisation_id
      AND COALESCE(s.branch_id,'')=COALESCE(NEW.home_branch_id,'')
  )
  OR (NEW.is_cross_branch=1 AND trim(COALESCE(NEW.cross_branch_reason,''))='')
  OR (NEW.is_cross_branch=0 AND COALESCE(NEW.branch_id,'')<>COALESCE(NEW.home_branch_id,''))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: invalid visit assignment scope'); END;

DROP TRIGGER IF EXISTS tenant_guard_visit_assignment_update;
CREATE TRIGGER tenant_guard_visit_assignment_update
BEFORE UPDATE OF organisation_id,branch_id,home_branch_id,is_cross_branch,cross_branch_reason,visit_id,staff_id
ON visit_staff_assignments
WHEN NEW.organisation_id<>OLD.organisation_id
  OR NEW.visit_id<>OLD.visit_id
  OR NEW.staff_id<>OLD.staff_id
  OR NOT EXISTS (
    SELECT 1 FROM care_visits v
    WHERE v.id=NEW.visit_id
      AND v.organisation_id=NEW.organisation_id
      AND COALESCE(v.branch_id,'')=COALESCE(NEW.branch_id,'')
  )
  OR NOT EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id=NEW.staff_id
      AND s.organisation_id=NEW.organisation_id
      AND COALESCE(s.branch_id,'')=COALESCE(NEW.home_branch_id,'')
  )
  OR (NEW.is_cross_branch=1 AND trim(COALESCE(NEW.cross_branch_reason,''))='')
  OR (NEW.is_cross_branch=0 AND COALESCE(NEW.branch_id,'')<>COALESCE(NEW.home_branch_id,''))
BEGIN SELECT RAISE(ABORT,'TENANT_BOUNDARY: invalid visit assignment update'); END;

CREATE INDEX IF NOT EXISTS idx_care_visits_branch_schedule
  ON care_visits(organisation_id,branch_id,scheduled_start,rota_status,status);
CREATE INDEX IF NOT EXISTS idx_staff_branch_status
  ON staff(organisation_id,branch_id,status,last_name,first_name);
CREATE INDEX IF NOT EXISTS idx_visit_assignments_cross_branch
  ON visit_staff_assignments(organisation_id,branch_id,is_cross_branch,allocation_status,allocated_at);
CREATE INDEX IF NOT EXISTS idx_notifications_rota_ack
  ON notifications(organisation_id,user_id,source,requires_acknowledgement,acknowledged_at,created_at DESC);

INSERT OR IGNORE INTO permission_catalog(permission_key,category,name,description,risk_level)
VALUES ('rota.cross_branch.cover','Scheduling','Authorise cross-branch cover','Allocate a care worker outside their home branch when local cover is unavailable, with a recorded reason.','high');
