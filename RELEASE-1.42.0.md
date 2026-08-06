# CoreCare Care 1.42.0

Release 1.42.0 adds Area Manager access and persistent operational assurance alerts for Care managers.

## Area Manager

- Adds an organisation-wide Area Manager role between Organisation Owner and Registered Manager.
- Gives Area Managers full Care permissions and visibility across all branches.
- Allows Area Managers to create, update and review Registered Manager and lower-ranked accounts.
- Prevents Registered Managers and branch roles from granting Area Manager access.
- Includes Area Managers in incident-alert emails, management coverage checks and organisation-wide controlled-medicine witness authority.

## Persistent manager alerts

- Adds manager-only alert permissions for Area Managers, Registered Managers, Deputy Managers and Branch Managers.
- Prompts managers about active incidents, safeguarding concerns, missed and late visits, overrunning visits, urgent unallocated visits, overdue tasks, care-plan and risk alerts, low medication stock, eMAR exceptions and overdue access reviews.
- Keeps an alert dock visible across the Care workspace while active issues remain.
- Re-prompts unacknowledged alerts after dismissal (every minute for critical alerts and every five minutes for warnings), refreshes every 60 seconds and refreshes when the browser becomes active again.
- Records each manager's acknowledgement separately without treating acknowledgement as resolution.
- Applies organisation and branch scope to both alert visibility and source records.

## Database

Apply `migrations/0053_area_manager_alerts.sql` before deploying the Worker. The migration adds the manager-alert permission catalogue entries and tenant-guarded acknowledgement records.

## Verification

- Run `npm.cmd run verify:source` and `npm.cmd test`.
- Apply all migrations to a clean local D1 database.
- Run `npm.cmd run check` for a production Worker bundle dry run.
