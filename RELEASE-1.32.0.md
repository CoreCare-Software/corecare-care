# CoreCare Care 1.32.0 — Incidents, basic finance and live reports

This release is deliberately limited to three connected management areas: incidents, basic finance and reports.

## Incidents

- Incidents now receive a readable reference and can move through Reported, Investigating, Monitoring actions and Closed.
- Reporting captures harm, immediate action, witnesses, safeguarding flags and external-notification information.
- Management reviews can record an owner, due date, contributing factors, actions and lessons learned.
- Every management update is retained in the incident timeline instead of overwriting the audit trail.
- Branch-restricted users receive only incidents and linked client choices from their active branch.

## Basic finance

- Managers can raise simple client invoices and mark them sent, paid or void.
- Paid invoices automatically create a matching income entry; managers can also record basic income and expenses manually.
- The workspace shows cashbook position, monthly income and expenses, net movement and outstanding invoices.
- Organisations can store an HTTPS shortcut to Xero, QuickBooks, Sage, FreeAgent or another finance service.
- CoreCare clearly hands off bank feeds, reconciliation, VAT, payroll and statutory accounts to full accountancy software. No external passwords or bank data are stored.
- A Finance Plus route is presented as a future upgrade enquiry, not as an already-delivered accounting product.

## Reports

- Date-controlled reports calculate care delivery, on-time starts, incidents, task completion, workforce checks and care-plan currency from live records.
- Incident themes and recent case detail are visible in the reporting workspace.
- Users who also have finance access receive a basic financial snapshot.
- CSV export is available only when the user has the existing `data.export` permission.
- Branch restrictions are applied to report queries.

## Deployment note

Apply `migrations/0043_incidents_finance_reports.sql` before deploying Worker version 1.32.0. The CoreCare Platform service binding and custom-domain configuration are unchanged.
