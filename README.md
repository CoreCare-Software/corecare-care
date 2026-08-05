# CoreCare Care

CoreCare Care is a multi-tenant care-management web application deployed as a Cloudflare Worker with static browser assets and a Cloudflare D1 database. The current package version is `1.38.1`.

Release 1.38.1 routes the Owner Portal button to the protected production custom domain. Release 1.38.0 added secure self-service password recovery, privacy-safe incident alerts and reliable central support-ticket confirmation to the requester, including queued retries.

> Release boundary: version 1.35.0 provides a controlled workflow for data-protection, clinical-safety, recovery, continuity, training and production-acceptance evidence. CoreCare cannot provide those organisational approvals; authorised people must review and sign each domain in Settings → Launch governance before real personal, medical or care data is entered.

## Current implementation

- Organisation-scoped authentication, sessions, password controls, and audit logging.
- Role, permission, module, branch, and support-mode access controls.
- Client and staff records, care plans, risk assessments, and client documents.
- Live operations, incident investigation and learning, dedicated task management, electronic call monitoring, rota planning, recurring visits, travel checks, and care delivery records.
- Basic client invoicing and cashbook records, with a secure shortcut to an organisation's external accountancy package.
- Live operational, quality, incident and permitted finance reports with controlled CSV export.
- Structured, versioned care plans with review and manager approval workflows.
- Medication profiles, eMAR administration, stock history, and body-map records.
- A self-contained Family Portal for creating family logins, linking relatives to clients, controlling shared record types, resetting temporary passwords, and disabling access.
- Automatic account invitations and password-security emails for Care staff, organisation users and family users through the central CoreCare Platform delivery service.
- Organisation settings, branding, security administration, and CoreCare Connect support tickets; family logins are managed in the Family Portal rather than general user settings.
- Platform administration APIs retained for the separate CoreCare Platform application.

## Repository layout

- `src/index.js` is the active Cloudflare Worker and JSON API entry point.
- `public/` contains the deployed HTML, CSS, JavaScript, headers, and vendored QR-code asset.
- `migrations/` contains the ordered D1 schema history.
- `wrangler.jsonc` defines the Worker, static assets, and D1 bindings.
- The similarly named JavaScript, HTML, and CSS files at the repository root are historical package copies; Wrangler does not deploy them.

## Development

Requires Node.js 20 or later.

```cmd
npm.cmd ci
npm.cmd run verify:source
npm.cmd run check
npm.cmd run dev
```

Apply database migrations only to the intended environment:

```cmd
npm.cmd run db:migrate:local
npm.cmd run db:migrate:remote
```

The `0042_corecare_connect_support.sql` migration extends support tables shared with CoreCare Platform. Follow `INSTALL-CORECARE-CONNECT-1.27.0.md` when applying it to the shared remote database. Migration `0043_incidents_finance_reports.sql` adds the incident investigation trail and organisation finance records used by release 1.32.0. Migration `0044_launch_readiness.sql` adds branch-boundary enforcement, expiring visit verification codes, controlled-medicine witness evidence and stronger incident closure records. Migration `0045_platform_coordinated_maintenance.sql` lets the existing Platform health poll claim Care's hourly maintenance safely without consuming another account-level cron trigger. Migration `0046_launch_governance.sql` adds permission-backed evidence records, criterion completion and authenticated organisational sign-off.

## Verification

- `npm.cmd run verify:source` checks JavaScript syntax and release-version consistency.
- `npm.cmd run check` performs a Cloudflare deployment dry run without publishing.

The Node test suite covers critical Platform access contracts, release-level source contracts and launch-safeguard contracts. `LAUNCH-READINESS-1.35.0.md` explains the controlled sign-off sequence and `LAUNCH-GOVERNANCE-PACK-1.35.0.md` provides the supporting evidence templates.
