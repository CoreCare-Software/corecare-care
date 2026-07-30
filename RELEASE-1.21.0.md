# CoreCare v1.21.0 — Client QR Verification and Dedicated Planning Board

## Database migration
No database migration is required. Existing client visit-code storage is reused.

## Changes
- Permanent verification codes are generated automatically with new clients.
- Existing clients receive a code automatically when opened for editing.
- Client records now show a QR preview, printable QR sheet, and audited manager-only regeneration.
- QR generation has been removed from Live Visits.
- The existing rota intelligence layout is preserved.
- A dedicated planning-board mode can open in the same tab or a separate browser tab.
- Planning mode moves allocation to the top by hiding overview panels until the planner returns.
