# CoreCare Enterprise 1.2.2 — Persistent Platform Views

## Fixed

- Platform navigation views are now mounted once and retained in the DOM.
- Returning to a page no longer removes its HTML or leaves it blank.
- Notifications, plans, audit and platform users no longer fail because their target elements disappeared.
- Browser back and forward navigation remains supported.
- No database migration is required.
