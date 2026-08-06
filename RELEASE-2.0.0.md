# CoreCare Care 2.0.0 — Commercial Care Assurance

This major release consolidates the Care product into a commercially deployable service-management platform while preserving its controlled organisational launch process.

## Release outcomes

- Multi-carer and double-handed visit allocation with publication blocking until the complete team passes workforce, branch, absence, overlap, competency, training, working-pattern and capability checks.
- Assignment-specific electronic call monitoring, offline receipt evidence and automated late, missed, short-team and other visit exceptions.
- Expanded eMAR safety: structured allergies, prescriber and authorisation evidence, medication reviews, time-critical schedules, numerical PRN 24-hour limits, covert-medication evidence, witnessed administrations, stock and supply audit trails, and organisation-timezone overdue decisions.
- Structured clinical assurance for observations, escalation, communication adjustments, capacity, best-interest decisions, legal authority, advance-care records and client journey events.
- Organisation quality workspace for complaints and other feedback, audits, corrective and preventive actions, effectiveness evidence and independent closure.
- Persistent management alerts for visit exceptions, medication exceptions, incidents, complaints, overdue quality actions, access reviews and care-governance work.
- Secure 48-hour staff, user and family activation links; no administrator-selected password is sent by email.
- Native Microsoft Authenticator-compatible MFA for privileged accounts with encrypted secrets, replay protection, bounded challenges and one-use recovery codes.
- Refined permission profiles for Area Managers, Registered Managers, branch managers, care coordinators, senior carers, care workers, families and auditors.

## Operational notes

- Apply D1 migrations `0054_native_mfa.sql` and `0055_commercial_care_safety.sql` before deploying the Worker.
- Set the production `MFA_ENCRYPTION_KEY` secret to a cryptographically random 32-byte base64 value before deployment.
- Migration 0054 revokes existing privileged sessions so those users reauthenticate and enrol in MFA.
- Continue to complete the in-product Launch governance approvals before entering real personal, clinical or care data for a new organisation.
