# CoreCare Care 1.41.0

Release 1.41.0 adds permission-led workforce access and formal access-review governance to CoreCare Care.

## Included

- Standard role profiles for organisation owners, managers, coordinators, senior carers, care workers, auditors and family users.
- Fine-grained permissions for visits, medicines, tasks, incidents, care plans, body maps, finance settings, reports and support.
- Permission implications that preserve required read access when a user is granted a related management action.
- Role-rank checks that prevent an administrator from assigning a role at or above their own authority.
- Organisation and branch scoping for user administration and permission overrides.
- Scheduled user-access reviews with recorded reviewer, outcome, summary and next review date.
- Database-level tenant guards for access-review records.

## Database

Apply `migrations/0052_role_access_governance.sql` before deploying the Worker. The migration adds the new permission catalogue entries and the tenant-scoped access-review register without removing existing roles or permissions.

## Verification

- All migrations apply to a fresh local D1 database.
- Worker and browser JavaScript syntax checks pass.
- Automated access, workforce, family, clinical and tenant-boundary contracts pass.
