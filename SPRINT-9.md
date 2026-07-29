# Sprint 9 — Complete SaaS Platform

## Added

- Platform-wide client, staff and user search with organisation and branch labels.
- Platform notification feed for trials, overdue care plans and DBS expiries.
- System health summary with active sessions, recent errors and audit volume.
- Subscription plan catalogue with UK pricing and feature/limit foundations.
- Platform security audit table.
- Platform administrator directory.
- Expanded organisation licensing, renewal, usage-limit, branding and feature-flag fields.
- Organisation archive state and safer platform management foundation.

## Migration

Apply `0009_complete_saas_platform.sql` to the remote D1 database before deploying the Worker.

```powershell
npx.cmd wrangler d1 migrations apply corecare --remote
```

## Validation

```powershell
npm.cmd install
npm.cmd run check
```

The project JavaScript files have passed syntax validation. The Cloudflare dry-run must be completed on Windows after dependencies are installed for that platform.
