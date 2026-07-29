# CoreCare Enterprise 1.3.1 — Workflow Engine

## Added
- Platform Workflow Engine workspace
- Workflow builder with triggers, conditions and actions
- Draft, active and paused workflow states
- Platform-wide and organisation-scoped definitions
- Manual test execution with run history and duration tracking
- Workflow templates for care reviews, training expiry and renewals
- Audit logging for workflow creation, updates, deletion and execution
- D1 migration `0019_workflow_engine.sql`

## Deployment
Apply all D1 migrations, then deploy the Worker and static assets.
