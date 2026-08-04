# CoreCare Care 1.35.0 controlled launch checklist

This checklist accompanies the in-product **Settings → Launch governance** workspace. It is an operational handover aid, not legal, regulatory or clinical approval.

## Controlled sequence

- [ ] Assign authorised owners for all eight launch-governance domains.
- [ ] Attach or reference the provider’s current evidence and add a criterion note for every completed item.
- [ ] Resolve every failed live technical-readiness check.
- [ ] Have the appropriate authenticated user approve each prerequisite domain under their accountable role.
- [ ] Complete production UAT with non-live or appropriately controlled test data.
- [ ] Record final production acceptance only after the other seven domains show **Approved**.
- [ ] Print or securely retain the completed evidence view and associated audit history.

## Approval rules implemented by CoreCare

- Evidence cannot become ready for sign-off without all criteria, a named owner, an accountable role, a meaningful summary and an evidence reference.
- Editing evidence automatically removes the previous approval.
- Approval records the signed-in user, stated accountable role, declaration and time.
- Reopening requires a reason and creates an audit event.
- Final production acceptance remains locked until every prerequisite domain is approved.

## Technical release verification

- [ ] `/api/health` and `/api/version` report version 1.35.0 and a healthy production database.
- [ ] Private document storage is configured.
- [ ] Fourteen database branch-boundary triggers are active.
- [ ] No unsupported authentication flags are enabled.
- [ ] At least two active management accounts exist.
- [ ] No active workforce account has an outstanding temporary-password change.
- [ ] Hourly maintenance completed successfully.
- [ ] Source checks, automated tests, dependency audit and deployment dry run pass.

## Rollback evidence

- Record the pre-migration D1 Time Travel bookmark in the release log.
- Retain the deployed Worker version identifier and migration output.
- If a critical check fails, stop new live entry, use the previous Worker version, assess forward-schema compatibility and follow the organisation’s approved recovery procedure.
