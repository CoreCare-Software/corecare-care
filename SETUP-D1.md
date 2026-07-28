# CoreCare Sprint 4A — Cloudflare D1 setup

This build deploys safely before D1 is connected. Until the database binding is added, the Clients module automatically continues using browser-local demonstration storage.

## Create the database in Cloudflare

1. Open **Cloudflare Dashboard**.
2. Go to **Storage & Databases → D1 SQL Database**.
3. Select **Create database**.
4. Name it `corecare`.
5. Open the new database and copy its **Database ID**.

## Add the D1 binding

Open `wrangler.jsonc` and add this block immediately before the `observability` block:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "corecare",
    "database_id": "PASTE-YOUR-DATABASE-ID-HERE"
  }
],
```

Remember to place a comma after the closing `assets` block.

## Apply the migration

Open a terminal in the repository folder and run:

```bash
npm install
npm run db:migrate:remote
```

When prompted, approve applying `0001_corecare_foundation.sql`.

Then commit and push the updated `wrangler.jsonc`. Cloudflare will deploy again. Open:

`/api/database`

on the end of the live workers.dev address. It should report `configured: true` and list the database tables.

## Development safety

Authentication is still a demonstration session in this increment. Use fictional client information only. Proper password authentication, sessions and role enforcement are the next foundation increment.
