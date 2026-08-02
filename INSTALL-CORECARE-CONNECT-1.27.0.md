# Install CoreCare Care 1.27.0

Copy this package into the CoreCare Care repository (`forget-me-not`).

Run:

```cmd
npm.cmd install
npx.cmd wrangler d1 migrations apply corecare --remote
npm.cmd run check
npx.cmd wrangler deploy
```

The shared migration `0042_corecare_connect_support.sql` only needs to be applied once to the shared CoreCare D1 database.
