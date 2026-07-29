# CoreCare Enterprise 1.4.2 — Operations Task Submission Hotfix

## Fixed

- Create Task now uses an explicit JavaScript submission flow rather than relying on dialog form behaviour.
- The Create Task button shows a saving state and cannot be double-clicked while saving.
- API errors are displayed inside the task dialog and in the CoreCare error notification.
- Failed submissions are logged to the browser console for diagnosis.
- Worker and interface versions are synchronised at 1.4.2.

## Database

No new migration is required.
