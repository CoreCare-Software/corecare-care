# CoreCare Sprint 4B — authentication setup

Sprint 4B requires the existing Cloudflare D1 binding named `DB` and both database migrations.

## 1. Apply the new migration

From the repository folder, run:

```bash
npx wrangler d1 migrations apply corecare --remote
```

Approve the migration when Wrangler asks. This applies `0002_authentication.sql` after the Sprint 4A foundation migration.

## 2. Deploy

Commit and push the updated repository. Cloudflare will deploy the Worker automatically.

## 3. Test the login

Use the development account:

- Email: `admin@demo.corecare`
- Password: `ChangeMe!2026`

The login is now checked by the Worker against D1. A secure, HTTP-only session cookie is created for 12 hours. Signing out removes the database session.

## 4. Confirm the status panel

After signing in, the dashboard should report:

- Database: Connected
- Authentication: database session
- Signed-in user: admin@demo.corecare
- Organisation: CoreCare Demonstration

## Important

This is still a development build. Use fictional information only. Password reset, multi-factor authentication, rate limiting, account invitations and production secrets will be added before pilot use.
