# CoreCare Sprint 7 setup

1. Copy the contents of this folder over the current project and replace matching files.
2. Apply the new D1 migration:

   `npx.cmd wrangler d1 migrations apply corecare --remote`

   Confirm `0006_care_planning.sql` is applied.
3. Run `npm.cmd install` and `npm.cmd run check`.
4. Commit and push through GitHub Desktop.
5. After Cloudflare finishes deploying, refresh with Ctrl+F5.

Use fictional client information while this remains a development environment.

## Important document-storage note

Sprint 7 includes a document register with dates, types, notes and secure reference URLs. Actual binary file upload is intentionally not stored inside D1. Direct upload will require a Cloudflare R2 bucket and an R2 binding in a later storage sprint.
