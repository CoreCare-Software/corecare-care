# CoreCare Enterprise v1.22.1 — Rota Planning UI Polish

## Database migration

No database migration is required.

## Changes

- Removed the **Open in new tab** action from the rota overview.
- Retained **Open full planning board** as the single planning-board entry point.
- Updated **Return to rota overview** to use the standard dark-green primary button style.
- Updated the application, Worker and footer version to **1.22.1**.

## Deployment

```cmd
npm.cmd install
npm.cmd run check
npx.cmd wrangler deploy
```
