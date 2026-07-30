# CoreCare Enterprise v1.20.6 — Login Dashboard Error Fix

## Database migration

No database migration is required.

## Fix

The dashboard router was loading the correct role-based dashboard and then making a second, unnecessary request to the generic management dashboard. For carer accounts, that second request failed and produced the red error toast even though the carer visits had loaded successfully.

The duplicate request has been removed. Each role now loads only its assigned dashboard.
