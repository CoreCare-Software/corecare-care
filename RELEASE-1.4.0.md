# CoreCare Enterprise 1.4.0 — Live Operations Board

## Added
- Live operational command centre for care managers
- Operational task creation, assignment, completion and escalation
- Incident recording and manager review
- Shift handovers with acknowledgement
- Live timeline, priority queue and compliance KPIs
- D1 migration `0021_live_operations_board.sql`

## Deployment
**Database migration required: Yes**

```powershell
npm.cmd run db:migrate:remote
npm.cmd install
npm.cmd run check
npx.cmd wrangler deploy
```
