# CoreCare 1.24.4 — Medication Save Hotfix

## Fix

The application scripts were loading before the medication dialog existed in the HTML document. As a result, the medication form submit listener was never attached. Pressing **Save medication** therefore performed a normal browser form submission, reloaded the application and returned the user to the organisation dashboard without saving.

This release moves the application scripts to the end of the document, after all dialogs and forms have been created, and updates the browser cache key to `app.js?v=1.24.4`.

## Database

No database migration is required for this hotfix.
