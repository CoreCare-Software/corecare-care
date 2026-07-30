# CoreCare Enterprise 1.15.3 — Rota Startup Stabilisation

## Fixed

- Fixed the rota startup error: `can't access lexical declaration 'visitsData' before initialization`.
- Initialised shared live-visit state with the rest of the application state before any page navigation can call the visits loader.
- Kept root and `public` frontend files synchronised.
- Updated the fallback application version to 1.15.3.

## Existing functionality retained

- Planner Intelligence and rota health.
- Optimise selected day.
- Care Delivery Command Centre.
- Client visit requirements, recurrence and protected time-critical visits.

## Database

No migration is required.
