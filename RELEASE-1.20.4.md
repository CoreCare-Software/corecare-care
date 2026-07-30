# CoreCare Enterprise 1.20.4 — Carer Dashboard Reliability

## Fixes
- Repairs the carer dashboard request that could fail and remain stuck on “Loading your allocated visits”.
- Uses the CoreCare 06:00–06:00 service day when selecting a carer’s visits.
- Keeps the dashboard operational if the visit-care-record table is unavailable during a staged migration.
- Continues to return only visits allocated to the login-linked staff record.
- Updates the central API version so the sidebar displays v1.20.4.

## Database
No migration required.
