# CoreCare Enterprise 1.22.0 — Workspace Framework

## Purpose

This release replaces the shared organisation sidebar with workspace-owned navigation. A user now receives only the routes belonging to their assigned workspace; permissions then refine access within that workspace.

## Changes

- Rebuilt organisation navigation dynamically after authentication.
- Carer accounts receive only **My visits**.
- Manager, coordinator, senior carer, family and auditor workspaces receive separate navigation definitions.
- Removed the old behaviour where identity refreshes could reveal the manager sidebar again.
- Added delegated navigation handling so dynamically generated workspace buttons work reliably.
- Quick Add is limited to manager and coordinator workspaces.
- Dashboard routing remains workspace-specific and server-side access controls remain in place.
- Updated the displayed and API version to 1.22.0.

## Database migration

No database migration is required.

## Test

1. Sign in as a carer and confirm the sidebar contains only **My visits**.
2. Refresh and confirm manager links do not reappear.
3. Confirm no false permission toast appears during login or refresh.
4. Sign in as each other role and confirm only its workspace navigation appears.
5. Try a manually entered prohibited route and confirm it is blocked.
