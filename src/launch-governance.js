export const LAUNCH_GOVERNANCE_DOMAINS = Object.freeze([
  {
    key: 'accountable_provider',
    title: 'Accountable provider',
    description: 'Confirms ownership, access design, family sharing and regulatory governance.',
    checks: [
      ['roles_reviewed', 'Roles, branch access and enabled modules have been reviewed against current responsibilities.'],
      ['family_authority_reviewed', 'Family identity, authority and sharing-review procedures are documented.'],
      ['operational_owners_named', 'The release owner, registered manager and operational system owner are named.'],
      ['regulatory_approval_recorded', 'The provider has recorded its own regulatory and governance approval route.']
    ]
  },
  {
    key: 'clinical_safety',
    title: 'Clinical safety',
    description: 'Records the provider-led clinical review of safety-critical care workflows.',
    checks: [
      ['hazards_reviewed', 'A clinical hazard log records foreseeable harms, controls, owners and residual risk.'],
      ['care_plan_reviewed', 'Care-plan creation, independent approval, review and escalation match provider policy.'],
      ['medication_reviewed', 'eMAR, PRN, stock, controlled-medicine witness and correction workflows are reviewed.'],
      ['incident_reviewed', 'Body-map escalation, safeguarding, duty of candour and incident closure are reviewed.']
    ]
  },
  {
    key: 'data_protection',
    title: 'Data protection',
    description: 'Captures the data controller’s privacy, lawful-basis and information-governance evidence.',
    checks: [
      ['dpia_completed', 'A DPIA covers care, medication, workforce, family and audit data.'],
      ['privacy_lawful_basis', 'Privacy notices, lawful bases and consent or authority records are approved.'],
      ['retention_rights', 'Retention, deletion, subject-rights and breach procedures are documented.'],
      ['processor_contracts', 'Processor agreements, international transfer position and supplier register are recorded.']
    ]
  },
  {
    key: 'backup_restore',
    title: 'Backup and restore',
    description: 'Makes recovery ownership, targets and tested evidence explicit.',
    checks: [
      ['recovery_owner_targets', 'A recovery owner, recovery-time target and recovery-point target are recorded.'],
      ['database_restore_test', 'A D1 Time Travel restore or isolated recovery rehearsal has been completed.'],
      ['worker_rollback_test', 'The Worker rollback process and compatible database decision are rehearsed.'],
      ['recovery_evidence_stored', 'Restore evidence, dates, outcomes and corrective actions are retained.']
    ]
  },
  {
    key: 'business_continuity',
    title: 'Business continuity',
    description: 'Confirms safe care delivery during Worker, database, network or device outages.',
    checks: [
      ['outage_procedure', 'Worker, D1, internet and device outage procedures are published.'],
      ['offline_care_fallback', 'Safe paper or offline care and medication fallback records are available.'],
      ['communications_route', 'Staff, family and management outage communication routes are defined.'],
      ['reconciliation_drill', 'Post-outage reconciliation and duplicate-record prevention have been rehearsed.']
    ]
  },
  {
    key: 'staff_training',
    title: 'Staff training and competence',
    description: 'Records role-based learning, witnessed scenarios and competence decisions.',
    checks: [
      ['role_matrix', 'A role-to-training matrix covers managers, coordinators, carers, auditors and family support.'],
      ['witnessed_scenarios', 'Witnessed scenarios cover visits, eMAR, incidents, family access and reporting.'],
      ['competence_exceptions', 'Failed, incomplete or restricted competence decisions have owners and actions.'],
      ['refresher_support', 'Refresher dates, onboarding and accessible support routes are published.']
    ]
  },
  {
    key: 'incident_response',
    title: 'Incident response',
    description: 'Names the operational, technical, clinical and out-of-hours response routes.',
    checks: [
      ['contacts_published', 'Technical, clinical, data-breach and out-of-hours contacts are published.'],
      ['severity_route', 'Severity, escalation, safeguarding and regulatory notification routes are agreed.'],
      ['evidence_preservation', 'Audit, log, record and communication evidence-preservation steps are defined.'],
      ['exercise_completed', 'A tabletop incident exercise has been completed and actions are tracked.']
    ]
  },
  {
    key: 'production_acceptance',
    title: 'Production acceptance',
    description: 'The accountable release owner’s final go/no-go decision after all prerequisites and UAT.',
    checks: [
      ['identity_session_uat', 'Sign-in, forced password change, sign-out and session expiry have passed UAT.'],
      ['branch_permission_uat', 'Branch isolation, role permissions, exports and family restrictions have passed UAT.'],
      ['clinical_workflow_uat', 'Care plans, eMAR, visits, body maps and incidents have passed end-to-end UAT.'],
      ['storage_operations_uat', 'Private documents, reporting, monitoring and recovery evidence have passed UAT.']
    ]
  }
]);

export function launchGovernanceDomain(key) {
  return LAUNCH_GOVERNANCE_DOMAINS.find(domain => domain.key === String(key || '').trim()) || null;
}

export function deriveLaunchDomainStatus(record = {}, checks = []) {
  if (record.status === 'approved') return 'approved';
  const completed = checks.filter(check => Boolean(check.completed)).length;
  const hasEvidence = String(record.evidence_summary || '').trim().length >= 20
    && String(record.evidence_reference || '').trim().length >= 3
    && String(record.owner_name || '').trim().length >= 2
    && String(record.owner_role || '').trim().length >= 2;
  if (checks.length && completed === checks.length && hasEvidence) return 'ready_for_signoff';
  if (completed || String(record.evidence_summary || record.owner_name || '').trim()) return 'in_progress';
  return 'not_started';
}

export function deriveOverallLaunchStatus(domains = []) {
  if (domains.length && domains.every(domain => domain.status === 'approved')) return 'approved';
  if (domains.length && domains.every(domain => ['ready_for_signoff', 'approved'].includes(domain.status))) return 'ready_for_signoff';
  if (domains.some(domain => domain.status !== 'not_started')) return 'in_progress';
  return 'not_started';
}

export function validateLaunchSignoff(domain, record, checks, prerequisiteDomains = []) {
  if (!domain) return 'This launch-governance domain does not exist.';
  if (deriveLaunchDomainStatus(record, checks) !== 'ready_for_signoff') return 'Complete every criterion, owner field and evidence reference before sign-off.';
  if (domain.key === 'production_acceptance' && prerequisiteDomains.some(item => item.key !== domain.key && item.status !== 'approved')) {
    return 'Every prerequisite domain must be approved before the final go/no-go decision.';
  }
  return '';
}
