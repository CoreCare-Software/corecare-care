# CoreCare Enterprise 1.4.1 — Live Operations Hotfix

## Fixed
- Restored the shared `setText` UI helper used by the Live Operations Board.
- Refresh now completes without the `setText is not defined` error.
- Client and staff selectors now populate when the board loads or refreshes.
- Root and `public` frontend assets have been synchronised.

## Database
No new migration is required.

## Deployment
```powershell
npm.cmd install
npm.cmd run check
npx.cmd wrangler deploy
```
