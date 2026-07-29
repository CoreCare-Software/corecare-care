# Sprint 8.3 — Separate Platform and Organisation Workspaces

This release separates the Platform Owner workspace from organisation care-management workspaces.

## Platform workspace

When a Platform Owner signs in and is not in Support Mode:

- the application opens directly on Platform Administration;
- organisation navigation such as Clients, Staff, Care Plans, Medication and Visits is hidden;
- Quick Add is hidden;
- only platform-wide totals, organisations and activity are displayed;
- no organisation care records are loaded into the browser.

## Organisation workspace

Opening an organisation starts audited Support Mode. The organisation navigation then appears and all care-management APIs continue to operate only within the selected organisation.

The Support Mode banner remains visible until **Return to platform** is selected. On return, organisation navigation and organisation care data disappear again.

Normal organisation accounts never receive the Platform Administration navigation or platform APIs.

No database migration is required for Sprint 8.3.
