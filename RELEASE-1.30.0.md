# CoreCare Care 1.30.0 — Integrated clinical records

Turns care plans, eMAR and body maps into safer day-to-day clinical workflows while retaining the existing Cloudflare deployment and database schema.

- Adds care-plan approval-readiness scoring and blocks incomplete plans from becoming active.
- Exposes the care-plan version and approval trail, and enforces read-only access in the browser and Worker.
- Adds a date-based daily eMAR round with due, overdue, completed, exception, PRN and unscheduled states.
- Adds audited medication stock adjustments and MAR corrections to the interface.
- Validates medication schedules, status, PRN protocols, administration times, exception reasons, PRN intervals and available stock.
- Creates operational follow-up tasks for medication exceptions and low stock.
- Fixes body-map save access to use the existing `care_plans.edit` permission.
- Adds body-map status summaries, filters, severity-aware markers and the complete progress timeline.
- Automatically creates an incident when a body-map concern is high, critical, reopened or escalated.
- Preserves the current Worker URL, Platform redirect and custom-domain configuration unchanged.

No database migration is required.
