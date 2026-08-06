# CoreCare Care 1.40.0

Release 1.40.0 upgrades the Family Portal into a consent-led communication and sharing hub for CoreCare Care.

## Included

- A polished family-facing home with the next published visit, shared update counts, unread messages and explicitly shared documents.
- Relationship, authority and access-review records with due-soon and overdue management warnings.
- Deliberately written family-safe care updates; internal visit care notes are no longer published automatically.
- Per-family-link document sharing; broad document permission alone no longer exposes every client document.
- Approved care-plan summaries with what matters, preferences and review date controls.
- Secure family-to-care-team message threads, replies, unread state, priority and conversation closure.
- In-app notifications and family-controlled notification preferences.
- A consolidated manager hub for access, accounts, reviews, messages, publications and document shares.
- Organisation and branch scoping, private R2 download checks and audited access-changing mutations.

## Database

Apply `migrations/0051_family_portal_hub.sql` before deploying the Worker. Existing family links are retained and receive an access-review date. Existing internal care notes and documents remain private until a manager publishes an update or shares an individual document.

## Verification

- The migration applies successfully to a fresh local D1 database.
- Worker and browser JavaScript syntax checks pass.
- Automated family privacy, validation, workflow and source-integration contracts pass.
