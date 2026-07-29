# CoreCare Enterprise 1.5.2 — Tenant Isolation Hardening

This release enforces organisation separation across the operational system.

## Included

- Organisation-scoped reads, writes and follow-up record retrieval
- Tenant-safe joins for clients, staff, users, rotas, visits and operations
- Organisation-scoped live visit clock updates and offline duplicate checks
- Database triggers preventing cross-organisation references
- Tenant boundary indexes for visits, events, tasks and incidents
- Existing multi-organisation platform and audited support-mode access retained

## Security model

Normal organisation users can only query records carrying their authenticated session organisation ID. Platform access remains separate, and support-mode entry remains explicit and audited.

## Migration

Migration `0024_tenant_isolation_hardening.sql` is required.
