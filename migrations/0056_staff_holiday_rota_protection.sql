-- CoreCare Care 2.0.1
-- Approved annual leave and database-enforced rota protection.

ALTER TABLE staff_absences ADD COLUMN leave_category TEXT NOT NULL DEFAULT 'absence'
  CHECK(leave_category IN ('absence','annual_leave'));
ALTER TABLE staff_absences ADD COLUMN approved_by TEXT;
ALTER TABLE staff_absences ADD COLUMN approved_at TEXT;
ALTER TABLE staff_absences ADD COLUMN rota_impacted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_absences_rota_protection
ON staff_absences(organisation_id,staff_id,leave_category,status,restricted,started_at,ended_at);

CREATE TABLE IF NOT EXISTS staff_absence_rota_impacts (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL,
  absence_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  previous_rota_status TEXT,
  action TEXT NOT NULL DEFAULT 'unallocated' CHECK(action IN ('unallocated')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organisation_id,absence_id,visit_id),
  FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  FOREIGN KEY (absence_id) REFERENCES staff_absences(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT,
  FOREIGN KEY (visit_id) REFERENCES care_visits(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_absence_rota_impacts_absence
ON staff_absence_rota_impacts(organisation_id,absence_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS staff_unavailable_assignment_insert
BEFORE INSERT ON visit_staff_assignments
WHEN NEW.allocation_status NOT IN ('removed','declined')
  AND EXISTS (
    SELECT 1
    FROM care_visits v
    JOIN staff_absences a
      ON a.organisation_id=NEW.organisation_id
     AND a.staff_id=NEW.staff_id
     AND a.restricted=1
     AND a.status IN ('planned','open')
     AND datetime(a.started_at)<datetime(COALESCE(v.scheduled_end,datetime(v.scheduled_start,'+30 minutes')))
     AND datetime(COALESCE(a.ended_at,'9999-12-31'))>datetime(v.scheduled_start)
    WHERE v.id=NEW.visit_id
      AND v.organisation_id=NEW.organisation_id
      AND v.status!='cancelled'
      AND COALESCE(v.rota_status,'published')!='cancelled'
  )
BEGIN SELECT RAISE(ABORT,'STAFF_UNAVAILABLE_FOR_VISIT'); END;

CREATE TRIGGER IF NOT EXISTS staff_unavailable_assignment_update
BEFORE UPDATE OF staff_id,visit_id,allocation_status ON visit_staff_assignments
WHEN NEW.allocation_status NOT IN ('removed','declined')
  AND EXISTS (
    SELECT 1
    FROM care_visits v
    JOIN staff_absences a
      ON a.organisation_id=NEW.organisation_id
     AND a.staff_id=NEW.staff_id
     AND a.restricted=1
     AND a.status IN ('planned','open')
     AND datetime(a.started_at)<datetime(COALESCE(v.scheduled_end,datetime(v.scheduled_start,'+30 minutes')))
     AND datetime(COALESCE(a.ended_at,'9999-12-31'))>datetime(v.scheduled_start)
    WHERE v.id=NEW.visit_id
      AND v.organisation_id=NEW.organisation_id
      AND v.status!='cancelled'
      AND COALESCE(v.rota_status,'published')!='cancelled'
  )
BEGIN SELECT RAISE(ABORT,'STAFF_UNAVAILABLE_FOR_VISIT'); END;

CREATE TRIGGER IF NOT EXISTS staff_unavailable_visit_insert
BEFORE INSERT ON care_visits
WHEN NEW.staff_id IS NOT NULL
  AND NEW.status!='cancelled'
  AND COALESCE(NEW.rota_status,'published')!='cancelled'
  AND EXISTS (
    SELECT 1 FROM staff_absences a
    WHERE a.organisation_id=NEW.organisation_id
      AND a.staff_id=NEW.staff_id
      AND a.restricted=1
      AND a.status IN ('planned','open')
      AND datetime(a.started_at)<datetime(COALESCE(NEW.scheduled_end,datetime(NEW.scheduled_start,'+30 minutes')))
      AND datetime(COALESCE(a.ended_at,'9999-12-31'))>datetime(NEW.scheduled_start)
  )
BEGIN SELECT RAISE(ABORT,'STAFF_UNAVAILABLE_FOR_VISIT'); END;

CREATE TRIGGER IF NOT EXISTS staff_unavailable_visit_update
BEFORE UPDATE OF staff_id,scheduled_start,scheduled_end,status,rota_status ON care_visits
WHEN NEW.staff_id IS NOT NULL
  AND NEW.status!='cancelled'
  AND COALESCE(NEW.rota_status,'published')!='cancelled'
  AND EXISTS (
    SELECT 1 FROM staff_absences a
    WHERE a.organisation_id=NEW.organisation_id
      AND a.staff_id=NEW.staff_id
      AND a.restricted=1
      AND a.status IN ('planned','open')
      AND datetime(a.started_at)<datetime(COALESCE(NEW.scheduled_end,datetime(NEW.scheduled_start,'+30 minutes')))
      AND datetime(COALESCE(a.ended_at,'9999-12-31'))>datetime(NEW.scheduled_start)
  )
BEGIN SELECT RAISE(ABORT,'STAFF_UNAVAILABLE_FOR_VISIT'); END;
