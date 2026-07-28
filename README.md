# Project Forget Me Not

Sprint 1 is the permanent Cloudflare foundation for the Forget Me Not care-management platform.

## What is included

- Cloudflare Worker entry point
- Workers Static Assets configuration
- Responsive demonstration login and dashboard
- `/api/health` health endpoint
- `/api/version` version endpoint
- Git-connected automatic deployment support

## Cloudflare build settings

When importing this GitHub repository into Cloudflare Workers Builds, use:

- **Project name:** `forget-me-not`
- **Production branch:** `main`
- **Build command:** leave blank
- **Deploy command:** `npx wrangler deploy`

Cloudflare installs the Wrangler version listed in `package.json` before running the deploy command.

## Demonstration login

- Email: `admin@demo.fmn`
- Password: `ChangeMe!2026`

This login is only a browser demonstration. It is not production authentication and no real personal or care data must be entered.

## Test after deployment

Open the application URL supplied by Cloudflare, then also open:

- `/api/health`
- `/api/version`

Both API addresses should display JSON.

## Repository structure

```text
public/          Browser application assets
src/index.js     Cloudflare Worker and API routes
package.json     Project metadata and Wrangler dependency
wrangler.jsonc   Cloudflare deployment configuration
```

## Next sprint

Sprint 2 will add the first real server-side data foundation, including D1 setup, migrations, organisations, users and authenticated sessions.
