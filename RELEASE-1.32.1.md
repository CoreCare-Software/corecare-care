# CoreCare Care 1.32.1 — Family access in one place

This release moves family-login setup and management into the Family Portal workspace.

## Family login accounts

- Managers can create a family login without leaving the Family Portal.
- Creation links the family member to a client immediately and records the exact information that may be shared.
- Family accounts are always created as read-only family users; the browser cannot request a staff or management role through this flow.
- Managers can update the family member's display name, disable or reactivate the login, and set a new temporary password.
- Password resets end existing sessions and require the family member to change the temporary password after signing in.

## Family access

- The Family Portal shows login accounts and their active client-link count alongside the access register.
- Existing family accounts can be linked to another client, and each link can be edited or revoked independently.
- Branch-restricted managers can only list, create, update and link family accounts within their active branch.
- Family users are no longer created or listed in the general Settings user editor.

## Deployment note

No database migration is required for version 1.32.1. The CoreCare Platform service binding and custom-domain configuration are unchanged.
