# CoreCare Enterprise 1.1.1
## Revenue Centre

Adds a live commercial workspace for the Platform Owner.

### Included
- Live MRR, ARR and average revenue per organisation
- New and suspended/cancelled MRR indicators
- Revenue breakdown by subscription plan
- 12-month reconstructed portfolio run-rate
- 30-day and 90-day renewal exposure
- Upcoming renewal table
- Revenue CSV export
- Revenue event schema for future billing integrations

### Data note
Current MRR and ARR use live plan values. Historical run-rate is reconstructed from organisation creation dates and current plan values until billing events are connected.

### Upgrade
Run `npx.cmd wrangler d1 migrations apply corecare --remote`, then `npm.cmd install` and `npm.cmd run check`.
