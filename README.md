# CoreCare v0.4.1 — Sprint 4B

CoreCare is a developing care-management SaaS application deployed through GitHub and Cloudflare Workers.

## Included in this release

- D1-backed user authentication
- PBKDF2-SHA-256 password verification
- Secure HTTP-only session cookies
- Session expiry and logout
- Organisation-scoped client API access
- Role checks for client changes
- Login and client audit events
- Development platform-status panel
- CoreCare version `0.4.1`

## Database setup

Apply both migrations in order. See `SETUP-D1.md` and `SETUP-AUTH.md`.

## Development warning

Use fictional test records only. CoreCare is not yet approved for live personal, medical or care data.
