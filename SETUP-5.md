# CoreCare Sprint 5 deployment

## What this release adds

- Cloud-based D1 client records
- Expanded personal, address, GP, next-of-kin and care information
- Client search and status filters
- Client profile pages
- Editing and archiving
- Working **Quick add → Add client**
- Audit entries for creating, editing and archiving clients

Use fictional information during development.

## Deploy

1. Copy these files into the existing `forget-me-not` repository and replace the existing versions.
2. Open a terminal in the repository folder.
3. Apply the new D1 migration:

```powershell
npx.cmd wrangler d1 migrations apply corecare --remote
```

4. Confirm migration `0004_client_profiles.sql` is applied.
5. Check the Worker build:

```powershell
npm.cmd run check
```

6. Commit the changes in GitHub Desktop with:

```text
Sprint 5 - Client records
```

7. Push to GitHub and allow Cloudflare to deploy automatically.
8. Refresh CoreCare with `Ctrl + F5`.

## Test checklist

1. Sign in and remain signed in after refresh.
2. Open **Clients**.
3. Click **Add client** and create a fictional client.
4. Confirm the client appears in the list.
5. Click the client's name to open the profile.
6. Edit the record and confirm the changes remain after refresh.
7. Search by surname, town, postcode and NHS number.
8. Test Active, Paused and Archived filters.
9. As an owner or manager, archive a client and confirm it appears under Archived.
10. Open Settings and check the audit history includes client actions.
