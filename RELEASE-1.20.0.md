# CoreCare Enterprise 1.20.0 — Role-Based Workspaces

## Database migration

No database migration is required.

## Summary

This release separates each access level into a dedicated workspace. The role selects the dashboard and allowed navigation boundary; permissions continue to control actions within that workspace.

### Workspaces

- Platform owner: platform command centre only, except during an explicit support session.
- Organisation owner / registered manager / branch manager: manager workspace.
- Office staff: care coordinator workspace.
- Senior carer: senior carer workspace.
- Carer: carer workspace.
- Family member: read-only family workspace.
- Auditor: read-only audit workspace.

Users cannot move into another role's workspace simply because a route exists. Navigation is filtered by both the assigned access level and effective permissions.

## Deployment

```cmd
npm.cmd install
npm.cmd run check
npx.cmd wrangler deploy
```
