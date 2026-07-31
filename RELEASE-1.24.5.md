# CoreCare v1.24.5 — Care-plan section toggle hotfix

- Removed duplicate application-script loading from both HTML entry points.
- Ensured the application initialises once, after all dialogs are present.
- Removed native `method="dialog"` handling from the structured care-plan form so controls cannot trigger unintended native dialog behaviour.
- Added null-safe handling to care-plan domain section toggles.
- Updated the browser cache key to `app.js?v=1.24.5`.

Database migration: not required.
