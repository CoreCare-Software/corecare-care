# CoreCare Sprint 8 — Multi-organisation and access control

## Install
1. Copy this release over the current repository.
2. Apply the D1 migration:
   `npx.cmd wrangler d1 migrations apply corecare --remote`
3. Confirm `0007_multi_tenant_access.sql` is applied.
4. Run `npm.cmd run check`.
5. Commit and push to GitHub.

## What changes
- Existing data is retained in `CoreCare Demonstration` / `Main Branch`.
- The existing owner account becomes the platform owner.
- Platform owners can create and switch between organisations.
- Each organisation has isolated users, branches, clients, care plans, risks and documents.
- Branch-scoped operational roles are restricted to their active/home branch.
- New access levels include organisation owner/admin, branch manager, senior carer, carer, office staff, auditor and family member.
- Family-to-client permission links are available through the API foundation.

## Important test
Create a second fictional organisation, switch into it, and confirm the original organisation's clients and staff do not appear.
