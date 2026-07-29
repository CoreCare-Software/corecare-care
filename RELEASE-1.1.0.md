# CoreCare Enterprise 1.1.0
## Executive Platform Command Centre

This release replaces the Platform Owner landing page with an executive command centre powered by live platform data.

### Included
- Live MRR and ARR from active subscription plans
- Customer portfolio and organisation health scores
- Executive briefing generated from live platform conditions
- Active-user adoption figures
- At-risk organisation queue
- 30-day renewal forecast
- Platform operations summary
- Global search, activity, notifications, plans and audit retained
- Organisation 360 and isolated Support Mode retained

### Upgrade
Run `npx.cmd wrangler d1 migrations apply corecare --remote`, then `npm.cmd install` and `npm.cmd run check`.
