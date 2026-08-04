# CoreCare Care 1.35.0 — Controlled launch governance

This release turns the remaining organisational launch conditions into a permission-backed, auditable workflow inside Settings.

## Delivered

- Eight launch-governance domains covering accountable-provider review, clinical safety, data protection, backup and restore, business continuity, staff competence, incident response and final production acceptance.
- Criterion-level evidence notes, named owners, accountable roles and evidence references.
- Authenticated approval with signatory role, declaration, timestamp and optional review date.
- Automatic invalidation of approval when underlying evidence changes.
- A final go/no-go gate that cannot be approved until all prerequisite domains are approved.
- Live technical-evidence checks for version, database, private storage, branch safeguards, sign-in policy, administrator resilience, temporary passwords and scheduled maintenance.
- A printable evidence-pack view and immutable audit actions for evidence updates, approvals and reopened reviews.
- Dedicated governance permissions for view, evidence management and approval.

## Release boundary

The software records evidence and enforces the approval sequence. It does not appoint the clinical-safety lead, data controller, accountable provider or release owner, and it cannot attest that submitted statements are factually or legally sufficient. Those decisions remain with authorised people in the organisation.

Use `LAUNCH-READINESS-1.35.0.md` for the handover sequence and `LAUNCH-GOVERNANCE-PACK-1.35.0.md` when assembling evidence.
