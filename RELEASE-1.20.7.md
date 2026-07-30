# CoreCare Enterprise v1.20.7 — Workspace Dashboard Access Fix

## Database migration

No database migration is required.

## Fixes

- Treats each user’s assigned dashboard as part of their workspace rather than requiring a separate organisation module flag.
- Stops the false “You do not have permission to view this area” toast after a carer signs in or refreshes.
- Restores the **My visits** dashboard button in the carer sidebar.
- Keeps all non-dashboard modules protected by both workspace role and permissions.

## Test

1. Sign in as a carer.
2. Confirm the allocated visits load.
3. Confirm no permission toast appears.
4. Confirm **My visits** is visible in the sidebar and reloads the carer dashboard.
5. Confirm the carer still cannot access the full rota, staff, clients or manager dashboard.
