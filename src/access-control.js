const unique = values => [...new Set(values)];

export const CARE_PERMISSION_GROUPS = Object.freeze({
  dashboard: ['dashboard.view'],
  operations: ['operations.view', 'operations.manage'],
  managerAlerts: ['manager_alerts.view', 'manager_alerts.acknowledge'],
  rota: [
    'rota.view', 'rota.create', 'rota.edit', 'rota.publish', 'rota.cancel',
    'rota.templates.view', 'rota.templates.manage', 'rota.templates.generate',
    'rota.travel.override', 'rota.travel.settings', 'rota.visit.lock',
    'rota.visit.override_lock', 'rota.time_critical.override'
  ],
  visits: [
    'visits.view', 'visits.create', 'visits.clock', 'visits.records.view',
    'visits.records.manage', 'visits.codes.manage', 'visits.override'
  ],
  medication: [
    'medication.view', 'medication.administer', 'medication.stock.manage',
    'medication.correct', 'medication.manage'
  ],
  tasks: ['tasks.view', 'tasks.complete', 'tasks.manage'],
  incidents: ['incidents.view', 'incidents.create', 'incidents.review', 'incidents.manage'],
  people: [
    'clients.view', 'clients.create', 'clients.edit', 'clients.archive',
    'staff.view', 'staff.create', 'staff.edit'
  ],
  workforce: [
    'staff.records.view', 'staff.records.manage', 'staff.supervision.view',
    'staff.supervision.manage', 'staff.training.view', 'staff.training.manage',
    'staff.documents.view', 'staff.documents.manage', 'staff.hr.view',
    'staff.hr.manage', 'staff.reports.view'
  ],
  care: [
    'care_plans.view', 'care_plans.create', 'care_plans.edit',
    'care_plans.approve', 'care_plans.generate_visits', 'care_plans.archive',
    'risks.view', 'risks.manage', 'body_map.view', 'body_map.manage',
    'documents.view', 'documents.manage'
  ],
  family: ['family_portal.manage'],
  finance: ['finance.view', 'finance.manage', 'finance.settings.manage'],
  reporting: ['reports.view', 'reports.export', 'data.export'],
  quality: ['quality.view', 'quality.manage', 'quality.approve'],
  clinicalGovernance: [
    'clinical_governance.view', 'clinical_governance.manage',
    'observations.view', 'observations.manage'
  ],
  branches: ['branches.view', 'branches.manage'],
  organisation: [
    'organisation.settings.view', 'organisation.settings.manage',
    'governance.launch.view', 'governance.launch.manage', 'governance.launch.approve'
  ],
  security: [
    'security.roles.view', 'security.roles.manage', 'security.users.view',
    'security.users.manage', 'security.audit.view', 'security.sessions.manage'
  ],
  support: ['support.tickets.view', 'support.tickets.manage']
});

const group = (...names) => unique(names.flatMap(name => CARE_PERMISSION_GROUPS[name] || []));
const without = (values, removed) => values.filter(value => !removed.includes(value));

const registeredManager = group(
  'dashboard', 'operations', 'managerAlerts', 'rota', 'visits', 'medication', 'tasks', 'incidents',
  'people', 'workforce', 'care', 'family', 'finance', 'reporting', 'branches',
  'quality', 'clinicalGovernance', 'organisation', 'security', 'support'
);
const branchManager = without(registeredManager, [
  'organisation.settings.manage', 'governance.launch.approve',
  'security.roles.manage', 'security.sessions.manage',
  'finance.settings.manage', 'data.export'
]);
const coordinator = unique([
  ...group('dashboard', 'operations', 'tasks', 'family', 'support'),
  'clients.view', 'clients.create', 'clients.edit',
  'staff.view', 'staff.records.view', 'staff.training.view', 'staff.reports.view',
  'care_plans.view', 'care_plans.create', 'care_plans.edit',
  'care_plans.generate_visits', 'risks.view', 'risks.manage',
  'body_map.view', 'body_map.manage', 'documents.view', 'documents.manage',
  'medication.view', 'reports.view', 'branches.view',
  'quality.view', 'quality.manage', 'clinical_governance.view',
  'clinical_governance.manage', 'observations.view', 'observations.manage',
  'rota.view', 'rota.create', 'rota.edit', 'rota.publish', 'rota.cancel',
  'rota.templates.view', 'rota.templates.manage', 'rota.templates.generate',
  'rota.travel.override', 'rota.visit.lock',
  'visits.view', 'visits.create', 'visits.records.view', 'visits.codes.manage',
  'incidents.view', 'incidents.create'
]);
const seniorCarer = unique([
  'dashboard.view', 'operations.view', 'operations.manage',
  'rota.view', 'visits.view', 'visits.clock', 'visits.records.view', 'visits.records.manage',
  'medication.view', 'medication.administer', 'medication.stock.manage',
  'tasks.view', 'tasks.complete', 'tasks.manage',
  'incidents.view', 'incidents.create', 'incidents.review',
  'clients.view', 'clients.edit', 'staff.view', 'staff.training.view',
  'care_plans.view', 'care_plans.create', 'care_plans.edit',
  'risks.view', 'risks.manage', 'body_map.view', 'body_map.manage',
  'documents.view', 'documents.manage', 'reports.view', 'support.tickets.view',
  'support.tickets.manage', 'quality.view', 'quality.manage',
  'clinical_governance.view', 'clinical_governance.manage',
  'observations.view', 'observations.manage'
]);
const careWorker = [
  'dashboard.view', 'visits.view', 'visits.clock', 'visits.records.view',
  'visits.records.manage', 'medication.view', 'medication.administer',
  'tasks.view', 'tasks.complete', 'incidents.create', 'staff.view',
  'care_plans.view', 'risks.view', 'body_map.view', 'body_map.manage',
  'documents.view', 'clinical_governance.view', 'observations.view', 'observations.manage'
];
const auditor = unique([
  'dashboard.view', 'operations.view', 'rota.view', 'rota.templates.view',
  'visits.view', 'visits.records.view', 'medication.view', 'tasks.view',
  'incidents.view', 'finance.view', 'organisation.settings.view',
  'governance.launch.view', 'security.roles.view', 'security.users.view',
  'security.audit.view', 'clients.view', 'staff.view', 'staff.records.view',
  'staff.supervision.view', 'staff.training.view', 'staff.documents.view',
  'staff.reports.view', 'care_plans.view', 'risks.view', 'body_map.view',
  'documents.view', 'reports.view', 'branches.view', 'quality.view',
  'clinical_governance.view', 'observations.view'
]);

export const STANDARD_ROLE_PROFILES = Object.freeze({
  organisation_owner: {
    label: 'Organisation owner', rank: 100, scope: 'organisation', reviewDays: 90,
    summary: 'Accountable owner with unrestricted organisation access, ownership and security control.',
    permissions: ['*']
  },
  area_manager: {
    label: 'Area manager', rank: 95, scope: 'organisation', reviewDays: 90,
    summary: 'Multi-branch operational leader with full Care access and authority over registered managers.',
    permissions: registeredManager
  },
  organisation_admin: {
    label: 'Registered manager', rank: 90, scope: 'organisation', reviewDays: 90,
    summary: 'Full Care access, including rotas, clinical records, workforce, finance, governance and security.',
    permissions: registeredManager
  },
  deputy_manager: {
    label: 'Deputy manager', rank: 80, scope: 'assigned_branch', reviewDays: 90,
    summary: 'Full day-to-day operational and clinical management within the assigned branch.',
    permissions: branchManager
  },
  branch_manager: {
    label: 'Branch manager', rank: 75, scope: 'assigned_branch', reviewDays: 90,
    summary: 'Full branch operations, rotas, care, workforce, incidents, finance and reporting.',
    permissions: branchManager
  },
  office_staff: {
    label: 'Care coordinator', rank: 60, scope: 'assigned_branch', reviewDays: 180,
    summary: 'Independent rota planning and publishing, visit coordination and care-record administration.',
    permissions: coordinator
  },
  senior_carer: {
    label: 'Senior carer', rank: 50, scope: 'assigned_branch', reviewDays: 180,
    summary: 'Shift leadership, direct care, eMAR, care records, concerns and delegated clinical updates.',
    permissions: seniorCarer
  },
  carer: {
    label: 'Care worker', rank: 40, scope: 'assigned_work', reviewDays: 180,
    summary: 'Assigned visits, care recording, eMAR administration, tasks and incident reporting.',
    permissions: careWorker
  },
  auditor: {
    label: 'Read-only auditor', rank: 20, scope: 'assigned_branch', reviewDays: 90,
    summary: 'Read-only evidence and audit access with no operational mutation permissions.',
    permissions: auditor
  },
  family: {
    label: 'Family member', rank: 10, scope: 'explicit_client_links', reviewDays: 365,
    summary: 'Only the family-safe information deliberately shared through active client links.',
    permissions: []
  },
  platform_owner: { label: 'Platform owner', rank: 1000, scope: 'platform', reviewDays: 30, summary: 'CoreCare platform administration.', permissions: ['*'] },
  platform_admin: { label: 'Platform administrator', rank: 900, scope: 'platform', reviewDays: 30, summary: 'CoreCare platform administration.', permissions: ['*'] }
});

export const PERMISSION_IMPLICATIONS = Object.freeze({
  'operations.manage': ['operations.view'],
  'manager_alerts.acknowledge': ['manager_alerts.view'],
  'rota.create': ['rota.view'], 'rota.edit': ['rota.view'], 'rota.publish': ['rota.view'],
  'rota.cancel': ['rota.view'], 'rota.templates.manage': ['rota.templates.view'],
  'rota.templates.generate': ['rota.templates.view'],
  'visits.create': ['visits.view'], 'visits.clock': ['visits.view'],
  'visits.records.manage': ['visits.records.view', 'visits.view'],
  'visits.codes.manage': ['visits.view'], 'visits.override': ['visits.records.manage', 'visits.view'],
  'medication.administer': ['medication.view'], 'medication.stock.manage': ['medication.view'],
  'medication.correct': ['medication.view'],
  'medication.manage': ['medication.view', 'medication.administer', 'medication.stock.manage', 'medication.correct'],
  'tasks.complete': ['tasks.view'], 'tasks.manage': ['tasks.view', 'tasks.complete'],
  'incidents.create': ['incidents.view'], 'incidents.review': ['incidents.view'],
  'incidents.manage': ['incidents.view', 'incidents.create', 'incidents.review'],
  'clients.create': ['clients.view'], 'clients.edit': ['clients.view'], 'clients.archive': ['clients.view'],
  'staff.create': ['staff.view'], 'staff.edit': ['staff.view'],
  'care_plans.create': ['care_plans.view'], 'care_plans.edit': ['care_plans.view'],
  'care_plans.approve': ['care_plans.view'], 'care_plans.generate_visits': ['care_plans.view'],
  'care_plans.archive': ['care_plans.view'], 'risks.manage': ['risks.view'],
  'body_map.manage': ['body_map.view'], 'documents.manage': ['documents.view'],
  'finance.manage': ['finance.view'], 'finance.settings.manage': ['finance.view'],
  'reports.export': ['reports.view'], 'data.export': ['reports.export', 'reports.view'],
  'branches.manage': ['branches.view'], 'organisation.settings.manage': ['organisation.settings.view'],
  'governance.launch.manage': ['governance.launch.view'],
  'governance.launch.approve': ['governance.launch.view'],
  'security.roles.manage': ['security.roles.view'], 'security.users.manage': ['security.users.view'],
  'support.tickets.manage': ['support.tickets.view'],
  'quality.manage': ['quality.view'], 'quality.approve': ['quality.view'],
  'clinical_governance.manage': ['clinical_governance.view'],
  'observations.manage': ['observations.view']
});

export function standardPermissionsForRole(role) {
  return STANDARD_ROLE_PROFILES[role]?.permissions || [];
}

export function roleRank(role) {
  return Number(STANDARD_ROLE_PROFILES[role]?.rank || 0);
}

export function roleScope(role) {
  return STANDARD_ROLE_PROFILES[role]?.scope || 'assigned_branch';
}

export function canAssignStandardRole(actorRole, targetRole) {
  if (!STANDARD_ROLE_PROFILES[targetRole] || String(targetRole).startsWith('platform_')) return false;
  if (['platform_owner', 'platform_admin', 'organisation_owner'].includes(actorRole)) return true;
  return roleRank(actorRole) > roleRank(targetRole);
}

export function impliedPermissionSources(permission) {
  const sources=[];
  for (const [source, implied] of Object.entries(PERMISSION_IMPLICATIONS)) {
    if (implied.includes(permission)) sources.push(source);
  }
  return sources;
}

export function publicStandardRoleProfiles() {
  return Object.entries(STANDARD_ROLE_PROFILES)
    .filter(([key]) => !key.startsWith('platform_'))
    .map(([key, profile]) => ({
      key, label: profile.label, rank: profile.rank, scope: profile.scope,
      reviewDays: profile.reviewDays, summary: profile.summary,
      permissions: [...profile.permissions]
    }))
    .sort((a, b) => b.rank - a.rank);
}

export function accessReviewState(nextReviewDate, now = new Date()) {
  if (!nextReviewDate) return 'not_reviewed';
  const due = new Date(`${nextReviewDate}T23:59:59Z`).getTime();
  if (!Number.isFinite(due)) return 'not_reviewed';
  const remaining = due - now.getTime();
  if (remaining < 0) return 'overdue';
  if (remaining <= 30 * 86400000) return 'due_soon';
  return 'current';
}
