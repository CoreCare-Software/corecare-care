# CoreCare Enterprise 1.6.1 — Custom Access Control D1 Hotfix

This release retains the complete organisation module and per-user permission system introduced in 1.6.0 and corrects migration 0025 for Cloudflare D1.

## Fix

- Replaced bulk and compound seed statements with independent D1-safe INSERT statements.
- Prevents `too many terms in compound SELECT: SQLITE_ERROR [code: 7500]` during remote migration.
- No permission, module, tenant-isolation or user-access functionality has been removed.

## Deployment

Because migration 0025 failed before being recorded, deploy this corrected build and rerun the remote migrations.
