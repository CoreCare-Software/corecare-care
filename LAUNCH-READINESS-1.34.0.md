# CoreCare Care 1.34.0 launch checklist

This is the operational handover checklist for a controlled launch. It is not legal, regulatory or clinical approval.

## Required before real care data

- [ ] The accountable provider approves the configured roles, branch access, modules and family-sharing permissions.
- [ ] The clinical-safety lead reviews care plans, eMAR, body maps, incident workflows and escalation routes against the provider's policies.
- [ ] The data controller completes the DPIA, privacy notices, lawful-basis/consent records, retention schedule and data-processing agreements.
- [ ] Restore from a D1 backup is tested and the recovery owner, recovery-time target and recovery-point target are recorded.
- [ ] Business-continuity procedures cover Worker, D1, internet and device outages, including safe paper/offline fallback and reconciliation.
- [ ] Production administrator and worker accounts are named, least-privilege and tested; all temporary passwords are changed at first sign-in.
- [ ] Staff complete role-based training and a witnessed end-to-end scenario for visit, eMAR, incident, family and reporting workflows.
- [ ] A named incident-response contact, clinical escalation contact and out-of-hours route are published to users.
- [ ] Family access is granted only after identity and authority are checked, and is reviewed when circumstances change.
- [ ] The accountable release owner records a go/no-go decision after the production smoke test.

## Production smoke test

- [ ] `/api/health` and `/api/version` report version 1.34.0 and a healthy database.
- [ ] Sign-in, forced password change, sign-out and session expiry work for a test organisation.
- [ ] A branch manager cannot open another branch's client, rota, incident, task, document or finance record.
- [ ] A care plan cannot be approved by its author when independent approval is required.
- [ ] A controlled medicine cannot be administered or corrected without a separate authorised witness.
- [ ] A visit can be clocked in/out with a current client code and rejects expired codes or invalid timestamps.
- [ ] A serious body-map concern creates and links an incident; a high-severity incident cannot close without required evidence.
- [ ] A private document can be uploaded, downloaded by an authorised user, and is denied to another branch or unlinked family user.
- [ ] A family account sees only the permitted fields for its linked client.
- [ ] CSV exports neutralise spreadsheet formulas and exclude finance data from unauthorised roles.
- [ ] Cloudflare logs and traces show request identifiers without exposing passwords, medication witness credentials or full record payloads.

## Rollback and evidence

- Record the pre-migration database backup location and timestamp in the release log.
- Keep the deployed Worker version identifier and migration output with the release evidence.
- If a critical smoke test fails, stop live entry, restore the previous Worker version, assess whether the schema can remain forward-compatible, and use the tested database restore procedure if data integrity is affected.
