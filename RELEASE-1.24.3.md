# CoreCare v1.24.3 — Medication Search Event Fix

- Replaced the fragile direct medication-name input binding with delegated input events.
- Medication results now render whenever text is typed into the Add Medication name field.
- Updated the app.js cache-busting version so Cloudflare and browsers fetch the corrected JavaScript.
- No database migration is required.
