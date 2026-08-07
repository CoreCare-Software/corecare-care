# CoreCare Care

CoreCare Care is a multi-tenant care-management web application deployed as a Cloudflare Worker with static browser assets and a Cloudflare D1 database. The current package version is `2.1.0`.

Release 2.1.0 adds opt-in AI rewriting to editable text areas for signed-in users. Suggestions are generated through the private CoreCare Platform broker, remain separate from the original until the user accepts them, and inherit the existing tenant and role boundaries.

> Release boundary: version 1.35.0 provides a controlled workflow for data-protection, clinical-safety, recovery, continuity, training and production-acceptance evidence. CoreCare cannot provide those organisational approvals; authorised people must review and sign each domain in Settings → Launch governance before real personal, medical or care data is entered.

## Current implementation

- Organisation-scoped authentication, sessions, password controls, and audit logging.
- Role, permission, module, branch, and support-mode access controls.
- Organisation-wide Area Managers above Registered Managers, with rank-protected account delegation and multi-branch visibility.
- Persistent, manager-only operational alerts with acknowledgement history, repeating unacknowledged prompts, a live alert dock and 60-second refresh.
- Native Microsoft Authenticator-compatible MFA for privileged accounts, encrypted TOTP secrets and one-use recovery codes.
- Client and staff records, care plans, risk assessments, and client documents.
- Live operations, incident investigation and learning, dedicated task management, electronic call monitoring, rota planning, recurring visits, travel checks, and care delivery records.
- Basic client invoicing and cashbook records, with a secure shortcut to an organisation's external accountancy package.
- Live operational, quality, incident and permitted finance reports with controlled CSV export.
- Structured, versioned care plans with review and manager approval workflows.
- Medication profiles with prescriber and review evidence, time-critical schedules, numerical PRN limits, allergy snapshots, covert-medication controls, witnessed administrations, stock history, and body-map records.
- Structured clinical observations, accessible-information profiles, Mental Capacity Act and legal-authority records, client journey events, allergy records and medication-supply evidence.
- Complaints, compliments, concerns, whistleblowing, quality audits, corrective and preventive actions, effectiveness review and independent closure controls.
- Double-handed and multi-carer visits with safe-candidate checks for absence, overlap, working patterns, training, competency, capability and branch access.
- A self-contained Family Portal for family login management, relationship and authority reviews, deliberately published care updates, explicit per-document sharing, approved care-plan summaries, secure messages, notifications and personal preferences.
- Automatic, time-limited account activation and password-security emails for Care staff, organisation users and family users through the central CoreCare Platform delivery service; passwords are never sent by email.
- Organisation settings, branding, security administration, and CoreCare Connect support tickets; family logins are managed in the Family Portal rather than general user settings.
- Platform administration APIs retained for the separate CoreCare Platform application.

## Repository layout

- `src/index.js` is the active Cloudflare Worker and JSON API entry point.
- `public/` contains the deployed HTML, CSS, JavaScript, headers, and vendored QR-code asset.
- `migrations/` contains the ordered D1 schema history.
- `wrangler.jsonc` defines the Worker, static assets, and D1 bindings.
- The similarly named JavaScript, HTML, and CSS files at the repository root are historical package copies; Wrangler does not deploy them.

## Development

Requires Node.js 20 or later.

```cmd
npm.cmd ci
npm.cmd run verify:source
npm.cmd run check
npm.cmd run dev
```

Apply database migrations only to the intended environment:

```cmd
npm.cmd run db:migrate:local
npm.cmd run db:migrate:remote
```

The `0042_corecare_connect_support.sql` migration extends support tables shared with CoreCare Platform. Follow `INSTALL-CORECARE-CONNECT-1.27.0.md` when applying it to the shared remote database. Migration `0043_incidents_finance_reports.sql` adds the incident investigation trail and organisation finance records used by release 1.32.0. Migration `0044_launch_readiness.sql` adds branch-boundary enforcement, visit verification code lifecycle fields, controlled-medicine witness evidence and stronger incident closure records. Migration `0045_platform_coordinated_maintenance.sql` lets the existing Platform health poll claim Care's hourly maintenance safely without consuming another account-level cron trigger. Migration `0046_launch_governance.sql` adds permission-backed evidence records, criterion completion and authenticated organisational sign-off. Migration `0050_staff_workforce_hub.sql` adds the Care-only workforce governance records used by release 1.39.0. Migration `0051_family_portal_hub.sql` adds consent reviews, deliberate publications, per-document shares, conversations, notifications and preferences used by release 1.40.0. Migration `0052_role_access_governance.sql` adds the fine-grained permissions and access-review records used by release 1.41.0. Migration `0053_area_manager_alerts.sql` adds manager-alert permissions and tenant-guarded acknowledgement history used by release 1.42.0. Migration `0054_native_mfa.sql` adds encrypted TOTP enrolment, recovery codes, bounded challenges and activation-token purpose. Migration `0055_commercial_care_safety.sql` adds multi-carer allocation, visit exceptions, enhanced medication safety, clinical governance, quality management and offline-receipt records used by release 2.0.0. Migration `0056_staff_holiday_rota_protection.sql` adds annual-leave classification, auditable rota impacts and database-enforced allocation guards used by release 2.0.1. Migration `0057_support_safety_branch_archive.sql` adds branch archive timestamps and request-correlated API error evidence used by release 2.0.2. Migration `0058_organisation_module_controls.sql` backfills the complete module catalogue and protects the core Care workspace used by release 2.0.3. Migration `0059_fixed_client_qr_codes.sql` makes active printed QR codes permanent, permits auditable repeated regeneration and enforces the client tenant boundary used by release 2.0.4. Migration `0060_staff_line_manager_accounts.sql` permits active higher-level user accounts to manage carers without requiring duplicate staff records and enforces the organisation boundary used by release 2.0.5.

## Verification

- `npm.cmd run verify:source` checks JavaScript syntax and release-version consistency.
- `npm.cmd run check` performs a Cloudflare deployment dry run without publishing.

The Node test suite covers critical Platform access contracts, release-level source contracts and launch-safeguard contracts. `LAUNCH-READINESS-1.35.0.md` explains the controlled sign-off sequence and `LAUNCH-GOVERNANCE-PACK-1.35.0.md` provides the supporting evidence templates.
