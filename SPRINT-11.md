# CoreCare Sprint 11 — Enterprise Identity & Security

This release introduces the central permission engine, custom role builder, user role assignments, active-session controls and organisation security policy centre.

## Migration

Run `npx.cmd wrangler d1 migrations apply corecare --remote` and confirm `0011_enterprise_identity_security.sql`.

## Validation

Run `npm.cmd install` then `npm.cmd run check`. Test role creation, permission selection, role assignment, session revocation and policy saving.
