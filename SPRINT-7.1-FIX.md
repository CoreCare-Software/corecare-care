# CoreCare Sprint 7.1 — Care Plans Navigation Fix

This release is built directly from the current deployed project supplied by the user.

## Fixes

- The main sidebar **Care plans** button now opens a working care-plan overview instead of the generic Future page.
- Displays active, due-soon, and overdue care-plan totals.
- Lists care plans across all clients.
- Adds search and status filtering.
- Opens the selected client's Care plans tab directly.
- Keeps the existing client-level care plans, risks, documents, versioning, dashboard and audit features.

## Database

No new migration is required. Migration `0006_care_planning.sql` remains the latest migration.
