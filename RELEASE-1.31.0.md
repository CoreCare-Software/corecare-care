# CoreCare Care 1.31.0 — Live rotas and connected workspaces

This release turns the rota, manager dashboard and family portal into connected operational workspaces backed by the existing CoreCare D1 records.

## Rota

- New visits and planner changes remain in draft until an authorised user publishes the selected week.
- Publication is blocked when a draft visit is unallocated, has invalid times or contains an unresolved travel conflict.
- Published visits flow to live visits, care-worker dashboards and authorised family accounts; drafts remain private to the planning team.
- Rota viewing, creation, editing, cancellation and publication now enforce their configured permissions at the Worker boundary.
- Branch-restricted users only receive rota clients, care workers, visits, patterns and assignments from their active branch.
- The rota header now shows draft and publication readiness, with clear manager guidance.

## Live manager dashboard

- Removed the fictional visit list, priority actions and fixed compliance percentages.
- Today’s visit completion, late calls, unallocated calls and draft changes are calculated from live rota records.
- Priorities are generated from live visits, overdue tasks, incidents, care-plan reviews, client reviews, risk assessments and workforce compliance.
- Compliance scores now reflect staff training, DBS/staff checks and current care-plan reviews.
- Dashboard rows link directly to the relevant operational workspace.

## Family portal

- Family accounts receive only clients explicitly linked through `family_client_access`.
- Managers can grant, amend and revoke access and choose whether profile, published visits, care updates, documents and medication are shared.
- Family dashboards now show the linked relative, next published visit and shared-record totals.
- The full family workspace presents upcoming and completed visits, completed care notes, shared documents and active medication according to the granted flags.
- Draft rota visits and all unrelated organisation, staff and client records remain excluded.

## Verification

- Pure operational calculations and browser-to-Worker wiring are covered by automated tests.
- No database migration is required for this release.
- The CoreCare Platform service binding and custom-domain configuration are unchanged.
