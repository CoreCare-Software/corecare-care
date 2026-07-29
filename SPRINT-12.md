# CoreCare Sprint 12 — Security Completion

This release completes the first enterprise security programme and repairs the missing Sprint 11 backend services.

## Delivered

- Working central permission evaluation engine
- Complete custom-role CRUD APIs
- Effective-access tester (“view as user” permission inspection)
- Temporary role validity enforcement
- Branch-scoped role enforcement
- Active-session listing and revocation
- Organisation login history
- Security policy lockout protection
- Emergency mode with mandatory reason and audit event
- Last-owner safeguards remain enforced through the existing user controls
- Security events added to the audit trail

## Migration

Apply `0012_security_completion.sql` before deployment.
