# CoreCare Care — whole-system coverage review

Reviewed against the repository at release 1.41.0 on 6 August 2026. This is a product-coverage review, not a declaration that using the software by itself makes a provider compliant. Provider policies, training, oversight, evidence and accountable decisions remain essential.

## Current position

CoreCare Care now has a strong operational foundation for a domiciliary or community-care provider:

| Area | Current repository coverage | Position |
| --- | --- | --- |
| Identity and access | Standard role hierarchy, granular permissions, custom roles, branch scope, permission overrides, session controls, audit history and scheduled access reviews | Strong |
| Managers and coordinators | Registered, deputy and branch manager profiles; care coordinators can create, edit, cancel and independently publish rotas within their branch | Strong |
| Client records | Profiles, contacts, GP/NOK details, onboarding, visit requirements, risk level, secure documents and archival | Strong foundation |
| Care planning | Structured/versioned plans, clinical domains, consent/capacity fields, risks, independent approval, review dates and visit generation | Strong |
| Care delivery | Live visits, assigned-worker scope, clock events, offline sync, care notes, observations, task outcomes, follow-up and incident escalation | Strong |
| Rota | Visual planning, templates, recurrence, availability, travel checks, protected times, locking, overrides, draft/publication workflow and audit history | Strong |
| Medicines | Medication profiles, eMAR, PRN/controlled-drug controls, witnesses, stock ledger, corrections and low-stock attention | Strong foundation |
| Body maps | Location, severity, monitoring, progress history and resolution | Strong foundation |
| Workforce | Safer recruitment, employment history, supervisions, training catalogue and records, competence, qualifications, appraisals, absence, restricted HR, secure documents and readiness reporting | Strong |
| Incidents | Reporting, severity, safeguarding flag, investigation, notifications, actions, learning, duty-of-candour evidence and closure rationale | Strong foundation |
| Family portal | Explicit client links, consent review, deliberately shared updates/documents, messaging, preferences, notifications and access revocation | Strong |
| Finance | Basic cashbook, client invoices, payment status, reporting and a safe link to Xero/QuickBooks/Sage/FreeAgent or another accounting package | Appropriate basic scope |
| Reporting | Visit, incident, task, care-plan, client, workforce and permitted finance reporting with controlled export | Good operational foundation |
| Governance and support | Launch evidence/sign-off, audit trail, organisation modules, support tickets and technical health checks | Good foundation |

## Material gaps still to add

These are not fully implemented as dedicated, end-to-end workflows in the present source. They should not be described as available features until built and tested.

### Launch-priority product gaps

1. **Complaints, compliments and feedback register** — intake, acknowledgement deadlines, investigation, response, outcome, learning, complainant communication and trend reporting. The current HR complaint type is not a provider complaints system.
2. **Quality assurance centre** — audit schedules, audit templates, findings, corrective-action plans, named owners, due dates, evidence and effectiveness review. Add a controlled policy/procedure register with versions, review dates and staff acknowledgement.
3. **Referrals and service lifecycle** — enquiry, referral assessment, compatibility/capacity decision, funding approval, start-of-care readiness, admission, transfer, hospital episode and discharge/closure.
4. **Accessible Information Standard workflow** — structured communication need, preferred format, flag, sharing instruction and review. A free-text communication-needs field exists, but does not yet provide a complete flag/share/review workflow.
5. **Consent, capacity and legal authority register** — decision-specific capacity assessments, best-interest decisions, LPAs/deputies, consent evidence, restrictive-practice review and DoLS/LPS tracking. Care plans contain capacity fields, but there is no separate decision register.
6. **Business continuity and emergency preparedness** — continuity plans, service dependencies, contact trees, scenario exercises, results, actions and evidence of recovery tests.

### Important operational extensions

7. **Leave, availability and timesheets** — leave requests/approval, availability, shift acceptance, actual-versus-planned time, mileage and payroll export. Absence records and rota patterns exist, but not the full employee workflow.
8. **Commissioning, contracts and funding** — commissioner/funder records, authorised hours, rates, purchase orders, contract dates, variations, reconciliations and funding alerts.
9. **Equipment, premises and infection-control assurance** — equipment/assets, service/inspection dates, environmental checks, PPE/infection audits, outbreaks and improvement actions.
10. **Information-rights operations** — subject-access requests, rectification, restriction, erasure decisions, breach workflow, retention schedules, legal holds and evidenced disposal. Some document retention fields and audit controls exist, but not the full workflow.
11. **Advanced management information** — complaints themes, safeguarding outcomes, medicines exceptions, continuity, missed/late care, workforce turnover, sickness, agency use, quality actions and commissioner-ready packs.
12. **External integrations** — accounting synchronisation rather than a secure link, payroll export, calendar/notifications, e-prescribing/pharmacy interoperability and commissioner/API exchange. These should be separately scoped and risk assessed.

## Recommended delivery order

1. Complaints/feedback plus quality audits and action plans.
2. Referrals/admission/discharge plus structured accessible-information and legal-decision registers.
3. Leave/availability/timesheets/mileage plus commissioner contracts and funding.
4. Continuity, equipment/infection assurance and information-rights operations.
5. Expanded dashboards, regulatory evidence packs and external integrations.

This order closes the biggest governance and provider-operating gaps first, then adds commercial and integration depth.

## Review basis

The gap assessment was checked against the current [CQC assessment framework](https://www.cqc.org.uk/guidance-regulation/providers/assessment/assessment-framework?trk=public_post-text), [CQC adult social care provider guidance](https://www.cqc.org.uk/guidance-regulation/adult-social-care), [CQC guidance on safe and effective staffing](https://www.cqc.org.uk/guidance-regulation/providers/assessment/single-assessment-framework/safe/safe-effective-staffing), [CQC medicines governance guidance](https://www.cqc.org.uk/guidance-providers/adult-social-care/good-governance-medicines), [CQC Accessible Information Standard guidance](https://www.cqc.org.uk/guidance-providers/meeting-accessible-information-standard), [GOV.UK adult social care provider data guidance](https://www.gov.uk/government/publications/adult-social-care-provider-information-provisions-data-collection/adult-social-care-provider-information-provisions-guidance-for-providers-on-data-collection) and the [GOV.UK duty of candour review](https://www.gov.uk/government/calls-for-evidence/duty-of-candour-review/duty-of-candour-review).
