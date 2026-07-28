# CoreCare

CoreCare is a cloud-based care management platform deployed with Cloudflare Workers and Static Assets.

## Version 0.3.0 — Sprint 3

This build adds the first functional product module:

- searchable client register
- status filtering
- add and edit client records
- client review and risk indicators
- browser-local persistence for safe demonstration testing
- responsive desktop and mobile layout
- health, version and capability API endpoints

## Demonstration safety

This build stores client entries in the current browser only. Use fictional information. The next engineering milestone will replace browser storage with authenticated Cloudflare D1 database records.

## Commands

- `npm run dev`
- `npm run check`
- `npm run deploy`
