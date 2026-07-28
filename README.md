# CoreCare

CoreCare is a cloud-based care management platform deployed with Cloudflare Workers and Static Assets.

## Version 0.4.0 — Sprint 4A

This build introduces the first real cloud-data foundation:

- Cloudflare D1 migration structure
- organisations, users, clients and audit-log tables
- organisation-scoped client API
- client create and update audit entries
- automatic browser-storage fallback until D1 is connected
- database health and capability reporting
- versioned migration commands

Read `SETUP-D1.md` to connect the database.

## Important development limitation

The current login remains a demonstration login. The D1 API is organisation-scoped to a fixed development organisation, but it is not yet protected by production authentication. Use fictional information only.

## Commands

- `npm run dev`
- `npm run check`
- `npm run deploy`
- `npm run db:migrate:local`
- `npm run db:migrate:remote`
