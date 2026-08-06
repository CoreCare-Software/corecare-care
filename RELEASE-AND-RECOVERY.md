# CoreCare Care release and recovery

## Release gate

A production release is allowed only when the pull request checks pass, including dependency audit, source tests, local D1 migration rehearsal, production configuration dry-run, staging configuration dry-run, and CodeQL. GitHub Actions are pinned to immutable commits and Dependabot monitors both npm and workflow dependencies.

Deploy to the isolated staging Worker and staging data stores first. Confirm that no production routes, databases, buckets, service bindings, secrets, or customer records are referenced by staging.

## Database changes

- Make schema changes forward-compatible with the currently deployed Worker.
- Rehearse every migration against a fresh local database and a representative staging copy.
- Record the D1 Time Travel bookmark immediately before applying a production migration.
- Apply each migration once through Wrangler; never edit a migration that has already run.
- Verify table counts, constraints, tenant boundaries, and the affected user journey without printing personal data.
- Do not combine irreversible data cleanup with a feature deployment.

## Production sequence

1. Record the release commit, Worker version, migration list, operator, and approval.
2. Confirm staging acceptance and the current production health response.
3. Apply approved backward-compatible migrations.
4. Deploy the exact reviewed commit.
5. Smoke-test health, sign-in, sign-out, session expiry, one authorised workflow, and one cross-tenant denial.
6. Check Worker errors, D1 errors, authentication failures, and audit events before declaring success.

## Recovery

Worker code is rolled back by deploying the last known-good Cloudflare Worker version. A D1 incident is recovered from Time Travel into an isolated database first; validate the restored data before changing any binding. Object data must be restored from the separately controlled recovery copy where the product uses R2.

Do not attempt a destructive reverse migration against the only production database. Preserve the failed release evidence and audit trail. Record the incident, customer impact, recovery point, recovery time, validation results, and follow-up actions.

## Required exercises

Run a staging restore exercise and a tenant-isolation regression at least quarterly and before any high-risk production launch. Record evidence in the release or incident log. Automated hourly maintenance is intentionally not required by this runbook.

