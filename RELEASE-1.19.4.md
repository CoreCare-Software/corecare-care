# CoreCare Enterprise 1.19.4 — Staff Login Onboarding

## Database migration
Required: `migrations/0034_staff_login_onboarding.sql`

## Changes
- Adds a one-to-one link between a CoreCare user account and a staff record.
- Adds “Create CoreCare login account” to staff onboarding.
- Creates a secure password hash and requires a password change at first login.
- Defaults new staff access to Carer and links the account to the active branch.
- Shows linked-login status, role and last login on staff records.
- Disables the linked login and active sessions when a staff member is made inactive.
- Makes `staff_id` available in authenticated sessions so visit allocation checks can identify the logged-in carer.

## Apply migration
`npx.cmd wrangler d1 migrations apply corecare --remote`
