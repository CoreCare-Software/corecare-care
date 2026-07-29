# CoreCare Enterprise 1.1.4 — Stability & Asset Synchronisation

## Fixes
- Synchronises root and `public/` frontend assets used by Cloudflare deployment.
- Fixes the Revenue Centre null `textContent` crash visible in the Platform workspace.
- Adds module-presence guards so optional platform sections cannot break the whole command centre.
- Uses isolated module loading: one failed panel no longer prevents the remaining platform panels loading.
- Adds a non-blocking error notification in place of disruptive browser alerts.
- Adds defensive Organisation 360 checks and clearer deployment guidance.
- Corrects frontend, package and Worker version metadata to 1.1.4.

## Database
No database migration is required.

## Upgrade
Extract over 1.1.3, run `npm.cmd install`, `npm.cmd run check`, then deploy.
After deployment, hard-refresh the browser with Ctrl+F5.
