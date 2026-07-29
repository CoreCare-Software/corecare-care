# CoreCare Sprint 4C setup

1. Copy the contents of this ZIP into the existing repository. This update intentionally does **not** include `wrangler.jsonc`, so your live D1 database binding is preserved.
2. Commit and push the files.
3. Apply the new migration from the repository folder:

```powershell
npx.cmd wrangler d1 migrations apply corecare --remote
```

Approve `0003_account_administration.sql`.

4. Wait for Cloudflare deployment and sign in with the existing administrator account. CoreCare will require an immediate password change.
5. Use **Settings** to manage users and review audit history.

Continue using fictional information during development.
