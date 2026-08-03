# CoreCare Care

CoreCare Care is a multi-tenant care-management web application deployed as a Cloudflare Worker with static browser assets and a Cloudflare D1 database. The current package version is `1.29.0`.

> Development warning: use fictional test records only. This repository is not approved for live personal, medical, or care data.

## Current implementation

- Organisation-scoped authentication, sessions, password controls, and audit logging.
- Role, permission, module, branch, and support-mode access controls.
- Client and staff records, care plans, risk assessments, and client documents.
- Live operations, dedicated task and incident management, electronic call monitoring, rota planning, recurring visits, travel checks, and care delivery records.
- Structured, versioned care plans with review and manager approval workflows.
- Medication profiles, eMAR administration, stock history, and body-map records.
- Organisation settings, branding, security administration, and CoreCare Connect support tickets.
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

The `0042_corecare_connect_support.sql` migration extends support tables shared with CoreCare Platform. Follow `INSTALL-CORECARE-CONNECT-1.27.0.md` when applying it to the shared remote database.

## Verification

- `npm.cmd run verify:source` checks JavaScript syntax and release-version consistency.
- `npm.cmd run check` performs a Cloudflare deployment dry run without publishing.

The Node test suite covers critical Platform access contracts and release-level source contracts. Broader API, migration, permission, and browser-flow coverage remains a development priority.
