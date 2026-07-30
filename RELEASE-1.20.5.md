# CoreCare Enterprise 1.20.5 — Carer Dashboard Query Fix

## Database migration

No database migration is required.

## Fixes

- Corrected the carer dashboard database query, which referenced a client `county` column that does not exist in the current CoreCare schema.
- The dashboard now loads the signed-in carer’s allocated visits and recent completed visits.
- The 06:00–06:00 service-day rules remain in place.
- Carer workspace isolation remains enforced.
- Updated the displayed release version to 1.20.5.
