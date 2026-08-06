# CoreCare Care 1.39.0

Release 1.39.0 replaces the basic staff directory with a Care-only workforce governance hub.

## Included

- Live workforce readiness across safer recruitment, supervision, appraisal, training, competencies, qualifications and expiring evidence.
- Structured formal supervision records with reflective discussion, wellbeing, learning, safeguarding, agreed outcomes, owned actions, due dates and completion state.
- Staff acknowledgement of completed supervisions and appraisals through the worker's own staff record.
- Configurable organisation supervision, appraisal, probation, warning and safe-allocation policies.
- A configurable training catalogue with core, role-specific and optional learning, renewal periods and allocation-critical requirements.
- Secure staff evidence in private R2 storage with file-signature checks, permission-controlled downloads, auditing and safer DBS handling.
- Restricted attendance, return-to-work, conduct, grievance, capability and employment safeguarding records.
- Branch-aware permissions separating workforce records, supervision, training, documents, restricted HR and reporting.
- Live manager-dashboard workforce compliance, directory filters and CSV assurance export.
- A retained audit timeline for staff-record changes and non-destructive archive transitions.

## Database

Apply `migrations/0050_staff_workforce_hub.sql` before deploying the Worker. The migration preserves existing staff records and seeds a configurable starter catalogue for every organisation.

## Verification

- All migrations apply successfully to a clean local D1 database.
- Worker and browser JavaScript syntax checks pass.
- The complete automated suite, including workforce readiness, privacy and source-integration contracts, passes.
