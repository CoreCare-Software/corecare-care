# CoreCare Enterprise 1.15.7 — Rota Runtime Repair

## Fixed

- Removed an accidental standalone `async` identifier that stopped rota interaction setup.
- Added the missing browser-side `mondayOf()` helper used by rota loading.
- Restored initial rota loading without requiring a manual refresh.
- Restored rota buttons, recurrence centre tabs, visit double-click and Planner Intelligence updates by allowing startup to complete.
- Updated cache-busted frontend assets and application version to 1.15.7.

## Database migration

No migration is required.
