export const ORGANISATION_MODULES = Object.freeze([
  { key: 'dashboard', name: 'Dashboard', description: 'Organisation overview, live priorities and management summaries.', category: 'Core workspace', permission: 'dashboard.view', required: true },
  { key: 'operations', name: 'Live operations', description: 'Live service monitoring, handovers and operational intervention.', category: 'Operations', permission: 'operations.view' },
  { key: 'clients', name: 'Clients', description: 'People receiving care, their profiles and core contact information.', category: 'Core workspace', permission: 'clients.view', required: true },
  { key: 'staff', name: 'Staff', description: 'Workforce records, supervision, training, holidays and compliance.', category: 'Core workspace', permission: 'staff.view', required: true },
  { key: 'family', name: 'Family portal', description: 'Family accounts, consent-led updates, messages and shared records.', category: 'People', permission: 'family_portal.manage' },
  { key: 'care', name: 'Care plans', description: 'Care plans, risks, body maps, documents and clinical governance.', category: 'Core workspace', permission: 'care_plans.view', required: true },
  { key: 'medication', name: 'Medication', description: 'Medication profiles, stock control, eMAR and administration records.', category: 'Care delivery', permission: 'medication.view' },
  { key: 'visits', name: 'Visits', description: 'Electronic call monitoring, visit records and attendance evidence.', category: 'Care delivery', permission: 'visits.view' },
  { key: 'rota', name: 'Scheduling & rota', description: 'Visit planning, allocation, travel checks and rota publication.', category: 'Planning', permission: 'rota.view' },
  { key: 'tasks', name: 'Tasks', description: 'Operational work, ownership, due dates and escalation.', category: 'Operations', permission: 'tasks.view' },
  { key: 'incidents', name: 'Incidents', description: 'Incident reporting, safeguarding, investigation and learning.', category: 'Quality & safety', permission: 'incidents.view' },
  { key: 'quality', name: 'Quality', description: 'Complaints, audits, corrective actions and provider assurance.', category: 'Quality & safety', permission: 'quality.view' },
  { key: 'finance', name: 'Finance', description: 'Basic income, expenditure, invoices and accounting connections.', category: 'Business', permission: 'finance.view' },
  { key: 'reports', name: 'Reports', description: 'Operational, compliance, quality and management reporting.', category: 'Business', permission: 'reports.view' },
  { key: 'settings', name: 'Settings', description: 'Organisation configuration, users, security and module controls.', category: 'Core workspace', permission: 'organisation.settings.view', required: true },
]);

export const MODULE_PERMISSION_MAP = Object.freeze(Object.fromEntries(ORGANISATION_MODULES.map(module => [module.key, module.permission])));

const MODULE_API_RULES = Object.freeze([
  ['tasks', /^\/api\/operations\/tasks(?:\/|$)/],
  ['incidents', /^\/api\/operations\/incidents(?:\/|$)/],
  ['quality', /^\/api\/quality(?:\/|$)/],
  ['family', /^\/api\/(?:family|family-access)(?:\/|$)/],
  ['staff', /^\/api\/(?:staff|workforce)(?:\/|$)/],
  ['medication', /^\/api\/medication(?:\/|$)/],
  ['visits', /^\/api\/visits(?:\/|$)/],
  ['rota', /^\/api\/(?:rota|routing)(?:\/|$)/],
  ['finance', /^\/api\/finance(?:\/|$)/],
  ['reports', /^\/api\/reports(?:\/|$)/],
  ['operations', /^\/api\/operations(?:\/|$)/],
  ['care', /^\/api\/(?:care-plans|care-delivery|body-map)(?:\/|$)/],
  ['care', /^\/api\/clients\/[^/]+\/(?:care-plans|risks|documents|governance|observations|allergies|journey)(?:\/|$)/],
  ['clients', /^\/api\/clients(?:\/|$)/],
]);

export function moduleForApiPath(pathname = '') {
  return MODULE_API_RULES.find(([, pattern]) => pattern.test(pathname))?.[0] || '';
}

export function organisationModuleState(rows = []) {
  const configured = Object.fromEntries(rows.map(row => [row.module_key, Boolean(row.enabled)]));
  return Object.fromEntries(ORGANISATION_MODULES.map(module => [module.key, module.required || configured[module.key] !== false]));
}

export function organisationModuleCatalogue(rows = []) {
  const states = organisationModuleState(rows);
  const updated = Object.fromEntries(rows.map(row => [row.module_key, row.updated_at || null]));
  return ORGANISATION_MODULES.map((module, order) => ({
    module_key: module.key,
    name: module.name,
    description: module.description,
    category: module.category,
    required: Boolean(module.required),
    enabled: states[module.key],
    updated_at: updated[module.key] || null,
    order,
  }));
}

export function normaliseOrganisationModuleUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result = {};
  for (const module of ORGANISATION_MODULES) {
    if (!(module.key in input)) continue;
    result[module.key] = module.required || input[module.key] === true;
  }
  return result;
}

export function organisationModuleSetupStatements(db, organisationId, updatedBy = null) {
  return ORGANISATION_MODULES.map(module => db.prepare(
    'INSERT OR IGNORE INTO organisation_modules(organisation_id,module_key,enabled,updated_by) VALUES(?,?,1,?)',
  ).bind(organisationId, module.key, updatedBy));
}
