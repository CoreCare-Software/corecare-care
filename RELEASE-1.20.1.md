# CoreCare Enterprise v1.20.1

## Visit and workspace hotfix

- Fixed the rota form error caused by using `event.currentTarget` after an awaited request.
- Client visit requirements now load when editing a client.
- Saving an edited client now replaces its active recurring requirements and regenerates future unallocated draft visits for the next eight weeks.
- Existing completed, in-progress, allocated, or historic visits are not removed.
- Platform owners in an authorised organisation support session can navigate the organisation workspace correctly.
- Updated the displayed application version to 1.20.1.

## Database migration

No database migration is required.
