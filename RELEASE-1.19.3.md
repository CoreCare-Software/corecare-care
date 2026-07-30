# CoreCare Enterprise 1.19.3

## Allocated Carer Visit Controls

This release corrects live visit selection, clocking, record completion and audit controls.

### Changes

- A carer can clock into only a visit allocated to their linked staff profile.
- QR/client codes no longer allow a carer to start another worker’s visit.
- When the same carer has several visits for one client, CoreCare selects the nearest scheduled visit; clock-out targets that carer’s active visit.
- A carer cannot start another visit while one is already in progress.
- Clock-out requires a completed care record and then marks the exact visit completed.
- Saving the care record no longer silently clocks the carer out.
- Completed care records are read-only for normal users.
- Authorised managers can amend a locked record only after giving a reason, which is written to the audit log.
- Clock-in and clock-out failures are now shown clearly in the visit dialog.

## Database migration

No database migration is required. This release uses the existing visit, care-record, event and audit tables.
