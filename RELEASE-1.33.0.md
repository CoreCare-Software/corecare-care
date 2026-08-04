# CoreCare Care 1.33.0 — Focused settings hub

This release reorganises organisation administration into a focused, sectioned Settings workspace.

## Settings experience

- A new overview gives managers direct access to organisation, branding, branches, users, security, modules and audit history.
- Context-specific actions replace the single page-level user action.
- Organisation profile and branding controls are separated while continuing to use the existing organisation profile service.
- Family-login management remains within the Family Portal.

## Access and security

- User accounts, custom roles, individual permission overrides and effective-access testing now share one access workspace.
- Security policy, emergency mode, login history and active sessions are grouped together.
- MFA, trusted-device and alternative sign-in controls are clearly marked as coming soon and cannot imply live enforcement.
- Settings areas load independently so one unavailable service does not prevent the remaining sections from working.

## Workflow improvements

- Travel and routing configuration now lives in Rota.
- Personal password changes now live in the signed-in user menu.
- Unsaved changes are shown and protected before leaving Settings or Rota.
- Save messages and repeated control labels have clearer success, error and accessibility states.

## Deployment note

No database migration is required for version 1.33.0. Existing organisation, security, routing and audit APIs remain unchanged.
