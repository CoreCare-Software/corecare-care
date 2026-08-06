import { WorkerEntrypoint } from 'cloudflare:workers';
import { exchangePlatformAccess } from './platform-access.js';
import { handlePlatformOrganisation } from './platform-organisations.js';
import { subscriptionAccess, subscriptionLimit, syncPlatformEntitlements } from './platform-entitlements.js';
import { carePlanReadiness, validateAdministration, validateBodyMap, validateMedicationProfile } from './clinical-records.js';
import { assessRotaPublication, calculateLiveDashboard } from './operational-workspaces.js';
import { calculateFinanceMetrics, calculateReportSummary, incidentReference, normaliseFinanceTransaction, normaliseIncidentReport, normaliseIncidentReview, normaliseInvoice, validateFinanceSettings } from './business-workspaces.js';
import { LAUNCH_GOVERNANCE_DOMAINS, deriveLaunchDomainStatus, deriveOverallLaunchStatus, launchGovernanceDomain, validateLaunchSignoff } from './launch-governance.js';
import { requestPlatformSupportTicket, requestPlatformTransactionalEmail } from './platform-email.js';
import { protectResponse, recordComplianceMutation } from './compliance-audit.js';
import { calculateStaffReadiness, calculateWorkforceOverview, normaliseSupervisionActions, normaliseWorkforceSettings } from './workforce-records.js';
import { workforceSetupStatements } from './workforce-seed.js';
import { familyAccessReviewState, normaliseFamilyPortalAccess, normaliseFamilyPreferences, validateFamilyMessage, validateFamilyUpdate } from './family-portal.js';
import { accessReviewState, canAssignStandardRole, impliedPermissionSources, publicStandardRoleProfiles, roleScope, standardPermissionsForRole } from './access-control.js';

/** CoreCare Care 1.41.0 - governed workforce access and role assurance */
const VERSION = "1.41.0";
const RELEASE = "CoreCare Care 1.41.0 - governed workforce access and role assurance";
const SESSION_COOKIE = "corecare_session";
const SESSION_HOURS = 12;
const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 5;

const application = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const requestId = clean(request.headers.get("cf-ray")) || crypto.randomUUID();
    try {
      if (url.pathname === "/platform-access" && request.method === "GET") return exchangePlatformAccess(request, env);
      if (url.pathname === "/api/health") {
        context.waitUntil(maybeRunScheduledMaintenance(env));
        return health(env);
      }
      if (url.pathname === "/api/version") return json({ name: "CoreCare", version: VERSION, release: RELEASE });
      if (url.pathname === "/api/auth/forgot-password" && request.method === "POST") return requestPasswordReset(request, env);
      if (url.pathname === "/api/auth/reset-password" && request.method === "POST") return resetPasswordWithToken(request, env);
      if (url.pathname === "/api/auth/portal-claim" && request.method === "POST") return claimPortalGrant(request, env, "CARE");
      if (["/auth/portal-login", "/api/auth/portal-login"].includes(url.pathname) && request.method === "POST") return portalLogin(request, env, "CARE");
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/session" && request.method === "GET") return sessionInfo(request, env);
      if (request.headers.get('x-corecare-product-key') && url.pathname === "/api/platform/organisations" && request.method === "POST") return handlePlatformOrganisation(request, env);
      if (request.headers.get('x-corecare-product-key') && url.pathname.startsWith("/api/platform/organisations/") && ["GET","PATCH"].includes(request.method)) return handlePlatformOrganisation(request, env, decodeURIComponent(url.pathname.slice("/api/platform/organisations/".length)));

      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return databaseRequired();
        if (!mutationOriginAllowed(request)) return json({ error: { code: "INVALID_ORIGIN", message: "This request did not originate from CoreCare." } }, 403);
        const session = await requireSession(request, env);
        if (session instanceof Response) return session;
        if(!session.support_mode&&!url.pathname.startsWith('/api/support/')){
          const access=session.subscription_access;
          if(!access||access.mode==='locked')return json({error:{code:'SUBSCRIPTION_REQUIRED',message:'This subscription needs attention. Contact your CoreCare owner or support to restore access.'}},402);
          if(access?.mode==='read_only'&&!['GET','HEAD','OPTIONS'].includes(request.method))return json({error:{code:'SUBSCRIPTION_READ_ONLY',message:'This workspace is read-only while the subscription payment is overdue.'}},402);
        }
        const scopeError = await enforceBranchScope(request, env.DB, session, url);
        if (scopeError) return scopeError;
        if (session.support_mode && session.support_access_mode === 'read_only' && !['GET','HEAD','OPTIONS'].includes(request.method) && url.pathname !== '/api/platform/exit-support') {
          return json({ error: { code: 'SUPPORT_MODE_READ_ONLY', message: 'This Platform support session is read-only.' } }, 403);
        }

        if (url.pathname === "/api/auth/change-password" && request.method === "POST") return changePassword(request, env, session);
        if (url.pathname === "/api/development/status") return developmentStatus(env, session);
        if (url.pathname === "/api/dashboard" && request.method === "GET") return await permitted(env.DB, session, "dashboard.view", () => dashboardSummary(env.DB, session));
        if (url.pathname === "/api/carer/dashboard" && request.method === "GET") return await permitted(env.DB, session, "visits.view", () => carerDashboard(env.DB, session));
        if (url.pathname === "/api/operations/board" && request.method === "GET") return operationsBoard(env.DB, session);
        if (url.pathname === "/api/rota" && request.method === "GET") return await permitted(env.DB, session, "rota.view", () => rotaBoard(env.DB, session, url));
        if (url.pathname === "/api/rota" && request.method === "POST") return await permitted(env.DB, session, "rota.create", () => createRotaVisit(request, env, session));
        if (url.pathname === "/api/rota/publish" && request.method === "POST") return await permitted(env.DB, session, "rota.publish", () => publishRota(request, env.DB, session));
        if (url.pathname === "/api/rota/templates" && request.method === "GET") return await permitted(env.DB, session, "rota.templates.view", () => listRotaTemplates(env.DB, session));
        if (url.pathname === "/api/rota/templates/visit" && request.method === "POST") return await permitted(env.DB, session, "rota.templates.manage", () => saveRotaVisitTemplate(request, env.DB, session));
        if (url.pathname === "/api/rota/templates/working-pattern" && request.method === "POST") return await permitted(env.DB, session, "rota.templates.manage", () => saveWorkingPattern(request, env.DB, session));
        if (url.pathname === "/api/rota/templates/exception" && request.method === "POST") return await permitted(env.DB, session, "rota.templates.manage", () => saveRotaException(request, env.DB, session));
        if (url.pathname === "/api/rota/templates/generate" && request.method === "POST") return await permitted(env.DB, session, "rota.templates.generate", () => generateRotaFromTemplates(request, env, session));
        const templateDeleteMatch=url.pathname.match(/^\/api\/rota\/templates\/(visit|working-pattern|exception)\/([^/]+)$/);
        if(templateDeleteMatch&&request.method === "DELETE") return await permitted(env.DB, session, "rota.templates.manage", () => deleteRotaTemplateItem(env.DB,session,templateDeleteMatch[1],decodeURIComponent(templateDeleteMatch[2])));
        if (url.pathname === "/api/routing/settings") {
          if (request.method === "GET") return getRoutingSettings(env, session);
          if (request.method === "PUT") return updateRoutingSettings(request, env, session);
        }
        if (url.pathname === "/api/routing/recalculate" && request.method === "POST") return recalculateRouting(request, env, session);
        const requirementMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/visit-requirements$/);
        if (requirementMatch && request.method === "GET") return await permitted(env.DB, session, "clients.view", () => listVisitRequirements(env.DB, session, decodeURIComponent(requirementMatch[1])));
        if (requirementMatch && request.method === "POST") return await permitted(env.DB, session, "rota.create", () => saveVisitRequirements(request, env.DB, session, decodeURIComponent(requirementMatch[1])));
        if (/^\/api\/rota\/[^/]+\/recurrence$/.test(url.pathname) && request.method === "POST") return await permitted(env.DB, session, "rota.edit", () => manageVisitRecurrence(request, env.DB, session, url.pathname.split("/")[3]));
        if (/^\/api\/rota\/[^/]+$/.test(url.pathname) && request.method === "PATCH") return await permitted(env.DB, session, "rota.edit", () => updateRotaVisit(request, env, session, url.pathname.split("/").pop()));
        if (/^\/api\/rota\/[^/]+\/cancel$/.test(url.pathname) && request.method === "POST") return await permitted(env.DB, session, "rota.cancel", () => cancelRotaVisit(request, env.DB, session, url.pathname.split("/")[3]));
        if (url.pathname === "/api/visits/board" && request.method === "GET") return await permitted(env.DB, session, "visits.view", () => visitsBoard(env.DB, session));
        if (url.pathname === "/api/visits" && request.method === "POST") return await permitted(env.DB, session, "visits.create", () => createVisit(request, env.DB, session));
        if (url.pathname === "/api/visits/client-code" && request.method === "POST") return await permitted(env.DB, session, "visits.codes.manage", () => ensureClientVisitCode(request, env.DB, session));
        if (url.pathname === "/api/visits/sync" && request.method === "POST") return await permitted(env.DB, session, "visits.clock", () => syncVisitEvents(request, env.DB, session));
        const visitRecordMatch = url.pathname.match(/^\/api\/visits\/([^/]+)\/care-record$/);
        if (visitRecordMatch && request.method === "GET") return await permitted(env.DB, session, "visits.records.view", () => getVisitCareRecord(env.DB, session, decodeURIComponent(visitRecordMatch[1])));
        if (visitRecordMatch && request.method === "POST") return await permitted(env.DB, session, "visits.records.manage", () => saveVisitCareRecord(request, env.DB, session, decodeURIComponent(visitRecordMatch[1])));
        if (url.pathname === "/api/operations/tasks" && request.method === "POST") return await permitted(env.DB, session, "tasks.manage", () => createOperationsTask(request, env.DB, session));
        const operationsTaskMatch = url.pathname.match(/^\/api\/operations\/tasks\/([^/]+)\/(complete|escalate)$/);
        if (operationsTaskMatch && request.method === "POST") return await permitted(env.DB, session, "tasks.complete", () => updateOperationsTask(env.DB, session, decodeURIComponent(operationsTaskMatch[1]), operationsTaskMatch[2]));
        if (url.pathname === "/api/operations/incidents" && request.method === "POST") return await permitted(env.DB, session, "incidents.create", () => createOperationsIncident(request, env, session));
        const operationsIncidentMatch = url.pathname.match(/^\/api\/operations\/incidents\/([^/]+)\/review$/);
        if (operationsIncidentMatch && request.method === "POST") return await permitted(env.DB, session, "incidents.review", () => reviewOperationsIncident(request, env.DB, session, decodeURIComponent(operationsIncidentMatch[1])));
        if (url.pathname === "/api/finance" && request.method === "GET") return await permitted(env.DB, session, "finance.view", () => financeWorkspace(env.DB, session));
        if (url.pathname === "/api/finance/transactions" && request.method === "POST") return await permitted(env.DB, session, "finance.manage", () => createFinanceTransaction(request, env.DB, session));
        if (url.pathname === "/api/finance/invoices" && request.method === "POST") return await permitted(env.DB, session, "finance.manage", () => createFinanceInvoice(request, env.DB, session));
        const financeInvoiceStatusMatch = url.pathname.match(/^\/api\/finance\/invoices\/([^/]+)\/status$/);
        if (financeInvoiceStatusMatch && request.method === "POST") return await permitted(env.DB, session, "finance.manage", () => updateFinanceInvoiceStatus(request, env.DB, session, decodeURIComponent(financeInvoiceStatusMatch[1])));
        if (url.pathname === "/api/finance/settings" && request.method === "PUT") return await permitted(env.DB, session, "finance.settings.manage", () => updateFinanceSettings(request, env.DB, session));
        if (url.pathname === "/api/reports" && request.method === "GET") return await permitted(env.DB, session, "reports.view", () => reportsWorkspace(env.DB, session, url));
        if (url.pathname === "/api/operations/handovers" && request.method === "POST") return await permitted(env.DB, session, "operations.manage", () => createShiftHandover(request, env.DB, session));
        const handoverAckMatch = url.pathname.match(/^\/api\/operations\/handovers\/([^/]+)\/acknowledge$/);
        if (handoverAckMatch && request.method === "POST") return await permitted(env.DB, session, "operations.manage", () => acknowledgeShiftHandover(env.DB, session, decodeURIComponent(handoverAckMatch[1])));
        if (url.pathname === "/api/care-plans" && request.method === "GET") return await permitted(env.DB, session, "care_plans.view", () => listAllCarePlans(env.DB, session, url));
        if (url.pathname === "/api/care-delivery/dashboard" && request.method === "GET") return await permitted(env.DB, session, "care_plans.view", () => careDeliveryDashboard(env.DB, session));
        if (url.pathname === "/api/medication" && request.method === "GET") return await permitted(env.DB, session, "medication.view", () => listMedication(env.DB, session, url));
        if (url.pathname === "/api/medication" && request.method === "POST") return await permitted(env.DB, session, "medication.manage", () => saveMedication(request, env.DB, session));
        const medicationAdminMatch = url.pathname.match(/^\/api\/medication\/([^/]+)\/administer$/);
        if (medicationAdminMatch && request.method === "POST") return await permitted(env.DB, session, "medication.administer", () => administerMedication(request, env.DB, session, decodeURIComponent(medicationAdminMatch[1])));
        if (url.pathname === "/api/medication/daily-mar" && request.method === "GET") return await permitted(env.DB, session, "medication.view", () => dailyMar(env.DB, session, url));
        const medicationStockMatch = url.pathname.match(/^\/api\/medication\/([^/]+)\/stock$/);
        if (medicationStockMatch && request.method === "POST") return await permitted(env.DB, session, "medication.stock.manage", () => adjustMedicationStock(request, env.DB, session, decodeURIComponent(medicationStockMatch[1])));
        const medicationCorrectionMatch = url.pathname.match(/^\/api\/medication\/administrations\/([^/]+)\/correct$/);
        if (medicationCorrectionMatch && request.method === "POST") return await permitted(env.DB, session, "medication.correct", () => correctMedicationAdministration(request, env.DB, session, decodeURIComponent(medicationCorrectionMatch[1])));
        if (url.pathname === "/api/body-map" && request.method === "GET") return await permitted(env.DB, session, "body_map.view", () => listBodyMap(env.DB, session, url));
        if (url.pathname === "/api/body-map" && request.method === "POST") return await permitted(env.DB, session, "body_map.manage", () => createBodyMapRecord(request, env.DB, session));
        const bodyMapUpdateMatch = url.pathname.match(/^\/api\/body-map\/([^/]+)\/update$/);
        if (bodyMapUpdateMatch && request.method === "POST") return await permitted(env.DB, session, "body_map.manage", () => updateBodyMapRecord(request, env, session, decodeURIComponent(bodyMapUpdateMatch[1])));
        const carePlanActionMatch = url.pathname.match(/^\/api\/care-plans\/([^/]+)\/(approve|generate-visits)$/);
        if (carePlanActionMatch && request.method === "POST") return await permitted(env.DB, session, carePlanActionMatch[2] === 'approve' ? "care_plans.approve" : "care_plans.generate_visits", () => carePlanAction(request, env.DB, session, decodeURIComponent(carePlanActionMatch[1]), carePlanActionMatch[2]));
        const carePlanHistoryMatch = url.pathname.match(/^\/api\/care-plans\/([^/]+)\/history$/);
        if (carePlanHistoryMatch && request.method === "GET") return await permitted(env.DB, session, "care_plans.view", () => carePlanHistory(env.DB, session, decodeURIComponent(carePlanHistoryMatch[1])));
        const careAlertMatch = url.pathname.match(/^\/api\/care-delivery\/alerts\/([^/]+)\/acknowledge$/);
        if (careAlertMatch && request.method === "POST") return await permitted(env.DB, session, "operations.manage", () => acknowledgeCareAlert(env.DB, session, decodeURIComponent(careAlertMatch[1])));
        if (url.pathname === "/api/support/tickets" && request.method === "GET") return await permitted(env.DB, session, "support.tickets.view", () => listOrganisationTickets(env.DB, session, url));
        if (url.pathname === "/api/support/tickets" && request.method === "POST") return await permitted(env.DB, session, "support.tickets.manage", () => createOrganisationTicket(request, env, session));
        const orgSupportTicketMatch = url.pathname.match(/^\/api\/support\/tickets\/([^/]+)$/);
        if (orgSupportTicketMatch && request.method === "GET") return await permitted(env.DB, session, "support.tickets.view", () => getOrganisationTicket(env.DB, session, decodeURIComponent(orgSupportTicketMatch[1])));
        if (orgSupportTicketMatch && request.method === "PUT") return await permitted(env.DB, session, "support.tickets.manage", () => updateOrganisationTicket(request, env.DB, session, decodeURIComponent(orgSupportTicketMatch[1])));
        const orgSupportMessageMatch = url.pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
        if (orgSupportMessageMatch && request.method === "POST") return await permitted(env.DB, session, "support.tickets.manage", () => addOrganisationTicketMessage(request, env.DB, session, decodeURIComponent(orgSupportMessageMatch[1])));
        const orgSupportAttachmentMatch = url.pathname.match(/^\/api\/support\/tickets\/([^/]+)\/attachments$/);
        if (orgSupportAttachmentMatch && request.method === "POST") return await permitted(env.DB, session, "support.tickets.manage", () => addOrganisationTicketAttachment(request, env.DB, session, decodeURIComponent(orgSupportAttachmentMatch[1])));
        const orgSupportAttachmentGetMatch = url.pathname.match(/^\/api\/support\/attachments\/([^/]+)$/);
        if (orgSupportAttachmentGetMatch && request.method === "GET") return await permitted(env.DB, session, "support.tickets.view", () => getOrganisationTicketAttachment(env.DB, session, decodeURIComponent(orgSupportAttachmentGetMatch[1])));
        if (url.pathname === "/api/platform/dashboard" && request.method === "GET") return platformDashboard(env.DB, session);
        if (url.pathname === "/api/platform/revenue" && request.method === "GET") return platformRevenue(env.DB, session);
        if (url.pathname === "/api/platform/customer-success" && request.method === "GET") return platformCustomerSuccess(env.DB, session);
        if (url.pathname === "/api/platform/assistant" && request.method === "POST") return platformAssistant(request, env.DB, session);
        if (url.pathname === "/api/platform/assistant/history" && request.method === "GET") return platformAssistantHistory(env.DB, session);
        if (url.pathname === "/api/platform/notifications" && request.method === "GET") return listNotifications(env.DB, session, url);
        if (url.pathname === "/api/platform/notifications/mark-all-read" && request.method === "POST") return markAllNotificationsRead(env.DB, session);
        const notificationActionMatch = url.pathname.match(/^\/api\/platform\/notifications\/([^/]+)\/(read|acknowledge|archive)$/);
        if (notificationActionMatch && request.method === "POST") return updateNotificationState(env.DB, session, decodeURIComponent(notificationActionMatch[1]), notificationActionMatch[2]);
        if (url.pathname === "/api/platform/workflows" && request.method === "GET") return listWorkflows(env.DB, session, url);
        if (url.pathname === "/api/platform/workflows" && request.method === "POST") return createWorkflow(request, env.DB, session);
        if (url.pathname === "/api/platform/workflows/templates" && request.method === "GET") return listWorkflowTemplates(env.DB, session);
        if (url.pathname === "/api/platform/workflows/runs" && request.method === "GET") return listWorkflowRuns(env.DB, session, url);
        const workflowMatch = url.pathname.match(/^\/api\/platform\/workflows\/([^/]+)$/);
        if (workflowMatch && request.method === "PUT") return updateWorkflow(request, env.DB, session, decodeURIComponent(workflowMatch[1]));
        if (workflowMatch && request.method === "DELETE") return deleteWorkflow(env.DB, session, decodeURIComponent(workflowMatch[1]));
        const workflowRunMatch = url.pathname.match(/^\/api\/platform\/workflows\/([^/]+)\/run$/);
        if (workflowRunMatch && request.method === "POST") return runWorkflow(request, env.DB, session, decodeURIComponent(workflowRunMatch[1]));
        if (url.pathname === "/api/platform/search" && request.method === "GET") return platformSearch(env.DB, session, url);
        if (url.pathname === "/api/platform/audit" && request.method === "GET") return platformAudit(env.DB, session, url);
        if (url.pathname === "/api/platform/notifications" && request.method === "GET") return platformNotifications(env.DB, session);
        if (url.pathname === "/api/platform/system-health" && request.method === "GET") return platformSystemHealth(env.DB, session);
        if (url.pathname === "/api/platform/plans") {
          if (request.method === "GET") return listSubscriptionPlans(env.DB, session);
          if (request.method === "POST") return saveSubscriptionPlan(request, env.DB, session);
        }
        if (url.pathname === "/api/platform/users" && request.method === "GET") return listPlatformUsers(env.DB, session);
        if (url.pathname === "/api/platform/organisations" && request.method === "GET") return listOrganisations(env.DB, session);
        if (url.pathname === "/api/platform/organisations" && request.method === "POST") return createOrganisation(request, env.DB, session);
        const orgMatch = url.pathname.match(/^\/api\/platform\/organisations\/([^/]+)$/);
        if (orgMatch && request.method === "GET") return getPlatformOrganisation(env.DB, session, decodeURIComponent(orgMatch[1]));
        if (orgMatch && request.method === "PUT") return updateOrganisationAdmin(request, env.DB, session, decodeURIComponent(orgMatch[1]));
        if (url.pathname === "/api/platform/switch-organisation" && request.method === "POST") return switchOrganisation(request, env.DB, session);
        if (url.pathname === "/api/platform/exit-support" && request.method === "POST") return exitSupportMode(env.DB, session);
        if (url.pathname === "/api/organisation/profile" && request.method === "GET") return await permitted(env.DB, session, "organisation.settings.view", () => getOrganisationProfile(env.DB, session));
        if (url.pathname === "/api/organisation/profile" && request.method === "PUT") return await permitted(env.DB, session, "organisation.settings.manage", () => updateOrganisationProfile(request, env.DB, session));
        if (url.pathname === "/api/launch-governance" && request.method === "GET") return getLaunchGovernance(env, session);
        const launchSignoffMatch = url.pathname.match(/^\/api\/launch-governance\/([^/]+)\/signoff$/);
        if (launchSignoffMatch && request.method === "POST") return updateLaunchGovernanceSignoff(request, env.DB, session, decodeURIComponent(launchSignoffMatch[1]));
        const launchGovernanceMatch = url.pathname.match(/^\/api\/launch-governance\/([^/]+)$/);
        if (launchGovernanceMatch && request.method === "PUT") return updateLaunchGovernanceDomain(request, env.DB, session, decodeURIComponent(launchGovernanceMatch[1]));
        if (url.pathname === "/api/security/permissions" && request.method === "GET") return listPermissionCatalogue(env.DB, session);
        if (url.pathname === "/api/security/roles") {
          if (request.method === "GET") return listCustomRoles(env.DB, session);
          if (request.method === "POST") return createCustomRole(request, env.DB, session);
        }
        const securityRoleMatch = url.pathname.match(/^\/api\/security\/roles\/([^/]+)$/);
        if (securityRoleMatch) {
          const roleId = decodeURIComponent(securityRoleMatch[1]);
          if (request.method === "PUT") return updateCustomRole(request, env.DB, session, roleId);
          if (request.method === "DELETE") return deleteCustomRole(env.DB, session, roleId);
        }
        if (url.pathname === "/api/security/overview" && request.method === "GET") return securityOverview(env.DB, session);
        if (url.pathname === "/api/security/sessions" && request.method === "GET") return listActiveSessions(env.DB, session);
        const revokeSessionMatch = url.pathname.match(/^\/api\/security\/sessions\/([^/]+)$/);
        if (revokeSessionMatch && request.method === "DELETE") return revokeSession(env.DB, session, decodeURIComponent(revokeSessionMatch[1]));
        if (url.pathname === "/api/security/policy") {
          if (request.method === "GET") return getSecurityPolicy(env.DB, session);
          if (request.method === "PUT") return updateSecurityPolicy(request, env.DB, session);
        }
        if (url.pathname === "/api/security/login-history" && request.method === "GET") return listLoginHistory(env.DB, session);
        if (url.pathname === "/api/security/effective-access" && request.method === "GET") return effectiveAccess(env.DB, session, url);
        if (url.pathname === "/api/security/access-governance" && request.method === "GET") return accessGovernance(env.DB, session);
        if (url.pathname === "/api/security/access-reviews" && request.method === "POST") return recordUserAccessReview(request, env.DB, session);
        if (url.pathname === "/api/security/modules") {
          if (request.method === "GET") return listOrganisationModules(env.DB, session);
          if (request.method === "PUT") return updateOrganisationModules(request, env.DB, session);
        }
        const userPermissionMatch = url.pathname.match(/^\/api\/security\/users\/([^/]+)\/permissions$/);
        if (userPermissionMatch) {
          const targetUserId = decodeURIComponent(userPermissionMatch[1]);
          if (request.method === "GET") return getUserPermissionOverrides(env.DB, session, targetUserId);
          if (request.method === "PUT") return updateUserPermissionOverrides(request, env.DB, session, targetUserId);
        }
        if (url.pathname === "/api/security/emergency-mode" && request.method === "PUT") return updateEmergencyMode(request, env.DB, session);
        if (url.pathname === "/api/branches") {
          if (request.method === "GET") return await permitted(env.DB, session, "branches.view", () => listBranches(env.DB, session));
          if (request.method === "POST") return await permitted(env.DB, session, "branches.manage", () => createBranch(request, env.DB, session));
        }
        const branchMatch = url.pathname.match(/^\/api\/branches\/([^/]+)$/);
        if (branchMatch && request.method === "PUT") return await permitted(env.DB, session, "branches.manage", () => updateBranch(request, env.DB, session, decodeURIComponent(branchMatch[1])));
        if (url.pathname === "/api/family/portal" && request.method === "GET") return familyPortal(env.DB, session);
        if (url.pathname === "/api/family/preferences") {
          if (request.method === "GET") return getFamilyPreferences(env.DB, session);
          if (request.method === "PUT") return updateFamilyPreferences(request, env.DB, session);
          return methodNotAllowed(["GET", "PUT"]);
        }
        if (url.pathname === "/api/family/messages") {
          if (request.method === "GET") return listFamilyMessages(env.DB, session);
          if (request.method === "POST") return saveFamilyMessage(request, env.DB, session);
          return methodNotAllowed(["GET", "POST"]);
        }
        const familyThreadMatch = url.pathname.match(/^\/api\/family\/messages\/([^/]+)$/);
        if (familyThreadMatch && request.method === "PATCH") return updateFamilyMessageThread(request, env.DB, session, decodeURIComponent(familyThreadMatch[1]));
        if (url.pathname === "/api/family/notifications/read-all" && request.method === "POST") return readAllFamilyNotifications(env.DB, session);
        const familyNotificationMatch = url.pathname.match(/^\/api\/family\/notifications\/([^/]+)$/);
        if (familyNotificationMatch && request.method === "PATCH") return readFamilyNotification(env.DB, session, decodeURIComponent(familyNotificationMatch[1]));
        if (url.pathname === "/api/family/management" && request.method === "GET") return await permitted(env.DB, session, "family_portal.manage", () => familyManagementHub(env.DB, session));
        if (url.pathname === "/api/family/updates" && request.method === "POST") return await permitted(env.DB, session, "family_portal.manage", () => publishFamilyUpdate(request, env.DB, session));
        const familyUpdateMatch = url.pathname.match(/^\/api\/family\/updates\/([^/]+)$/);
        if (familyUpdateMatch && request.method === "DELETE") return await permitted(env.DB, session, "family_portal.manage", () => withdrawFamilyUpdate(env.DB, session, decodeURIComponent(familyUpdateMatch[1])));
        const familyDocumentShareMatch = url.pathname.match(/^\/api\/family\/documents\/([^/]+)\/share$/);
        if (familyDocumentShareMatch) {
          if (request.method === "PUT") return await permitted(env.DB, session, "family_portal.manage", () => shareFamilyDocument(request, env.DB, session, decodeURIComponent(familyDocumentShareMatch[1])));
          if (request.method === "DELETE") return await permitted(env.DB, session, "family_portal.manage", () => unshareFamilyDocument(request, env.DB, session, decodeURIComponent(familyDocumentShareMatch[1])));
        }
        if (url.pathname === "/api/family-access") {
          if (request.method === "GET") return await permitted(env.DB, session, "family_portal.manage", () => listFamilyAccess(env.DB, session));
          if (request.method === "POST") return await permitted(env.DB, session, "family_portal.manage", () => saveFamilyAccess(request, env.DB, session));
        }
        if (url.pathname === "/api/family-access/accounts") {
          if (request.method === "GET") return await permitted(env.DB, session, "family_portal.manage", () => listFamilyAccounts(env.DB, session));
          if (request.method === "POST") return await permitted(env.DB, session, "family_portal.manage", () => createFamilyAccount(request, env, session));
          return methodNotAllowed(["GET", "POST"]);
        }
        const familyAccountMatch = url.pathname.match(/^\/api\/family-access\/accounts\/([^/]+)$/);
        if (familyAccountMatch && request.method === "PUT") return await permitted(env.DB, session, "family_portal.manage", () => updateFamilyAccount(request, env, session, decodeURIComponent(familyAccountMatch[1])));
        const familyAccessMatch = url.pathname.match(/^\/api\/family-access\/([^/]+)$/);
        if (familyAccessMatch && request.method === "DELETE") return await permitted(env.DB, session, "family_portal.manage", () => revokeFamilyAccess(request, env.DB, session, decodeURIComponent(familyAccessMatch[1])));
        if (url.pathname === "/api/workforce/overview" && request.method === "GET") return await permitted(env.DB, session, "staff.records.view", () => workforceOverview(env.DB, session));
        if (url.pathname === "/api/workforce/settings") {
          if (request.method === "GET") return await permitted(env.DB, session, "staff.records.view", () => getWorkforceSettings(env.DB, session));
          if (request.method === "PUT") return await permitted(env.DB, session, "staff.records.manage", () => updateWorkforceSettings(request, env.DB, session));
          return methodNotAllowed(["GET", "PUT"]);
        }
        if (url.pathname === "/api/workforce/training-catalog") {
          if (request.method === "GET") return await permitted(env.DB, session, "staff.training.view", () => getTrainingCatalogue(env.DB, session));
          if (request.method === "POST") return await permitted(env.DB, session, "staff.training.manage", () => saveTrainingCatalogue(request, env.DB, session));
          return methodNotAllowed(["GET", "POST"]);
        }
        const trainingCatalogueMatch = url.pathname.match(/^\/api\/workforce\/training-catalog\/([^/]+)$/);
        if (trainingCatalogueMatch && request.method === "PUT") return await permitted(env.DB, session, "staff.training.manage", () => saveTrainingCatalogue(request, env.DB, session, decodeURIComponent(trainingCatalogueMatch[1])));
        if (url.pathname === "/api/staff/me/workforce" && request.method === "GET") return getMyStaffWorkforce(env.DB, session);
        const staffWorkforceMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/workforce$/);
        if (staffWorkforceMatch && request.method === "GET") return await permitted(env.DB, session, "staff.records.view", () => getStaffWorkforce(env.DB, session, decodeURIComponent(staffWorkforceMatch[1])));
        const staffDocumentFileMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/documents\/([^/]+)\/file$/);
        if (staffDocumentFileMatch && request.method === "GET") return staffDocumentFile(env, session, decodeURIComponent(staffDocumentFileMatch[1]), decodeURIComponent(staffDocumentFileMatch[2]));
        const staffDocumentMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/documents\/([^/]+)$/);
        if (staffDocumentMatch && request.method === "DELETE") return await permitted(env.DB, session, "staff.documents.manage", () => archiveStaffDocument(env.DB, session, decodeURIComponent(staffDocumentMatch[1]), decodeURIComponent(staffDocumentMatch[2])));
        const staffDocumentsMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/documents$/);
        if (staffDocumentsMatch && request.method === "POST") return await permitted(env.DB, session, "staff.documents.manage", () => uploadStaffDocument(request, env, session, decodeURIComponent(staffDocumentsMatch[1])));
        const staffAcknowledgeMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/workforce\/(supervisions|appraisals)\/([^/]+)\/acknowledge$/);
        if (staffAcknowledgeMatch && request.method === "POST") return acknowledgeStaffRecord(request, env.DB, session, decodeURIComponent(staffAcknowledgeMatch[1]), staffAcknowledgeMatch[2], decodeURIComponent(staffAcknowledgeMatch[3]));
        const staffRecordMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/workforce\/(recruitment|employment|supervisions|training|competencies|qualifications|appraisals|absences|hr)\/([^/]+)$/);
        if (staffRecordMatch) {
          const staffId=decodeURIComponent(staffRecordMatch[1]),section=staffRecordMatch[2],recordId=decodeURIComponent(staffRecordMatch[3]);
          if (request.method === "PUT") return await permitted(env.DB, session, workforcePermission(section, "manage"), () => saveStaffWorkforceRecord(request, env.DB, session, staffId, section, recordId));
          if (request.method === "DELETE") return await permitted(env.DB, session, workforcePermission(section, "manage"), () => archiveStaffWorkforceRecord(env.DB, session, staffId, section, recordId));
          return methodNotAllowed(["PUT", "DELETE"]);
        }
        const staffRecordCollectionMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/workforce\/(recruitment|employment|supervisions|training|competencies|qualifications|appraisals|absences|hr)$/);
        if (staffRecordCollectionMatch && request.method === "POST") return await permitted(env.DB, session, workforcePermission(staffRecordCollectionMatch[2], "manage"), () => saveStaffWorkforceRecord(request, env.DB, session, decodeURIComponent(staffRecordCollectionMatch[1]), staffRecordCollectionMatch[2]));
        if (url.pathname === "/api/staff") {
          if (request.method === "GET") return await permitted(env.DB, session, "staff.view", () => listStaff(env.DB, session, url));
          if (request.method === "POST") return await permitted(env.DB, session, "staff.create", () => createStaff(request, env, session));
          return methodNotAllowed(["GET", "POST"]);
        }
        const staffMatch = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
        if (staffMatch) {
          const id = decodeURIComponent(staffMatch[1]);
          if (request.method === "PUT") return await permitted(env.DB, session, "staff.edit", () => updateStaff(request, env, session, id));
          return methodNotAllowed(["PUT"]);
        }
        const clientCareMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/(care-plans|risks|documents)$/);
        const documentUploadMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/documents\/upload$/);
        if (documentUploadMatch && request.method === "POST") return await permitted(env.DB, session, "documents.manage", () => uploadDocument(request, env, session, decodeURIComponent(documentUploadMatch[1])));
        if (clientCareMatch) {
          const clientId = decodeURIComponent(clientCareMatch[1]);
          const module = clientCareMatch[2];
          if (module === "care-plans") {
            if (request.method === "GET") return await permitted(env.DB, session, "care_plans.view", () => listCarePlans(env.DB, session, clientId));
            if (request.method === "POST") return await permitted(env.DB, session, "care_plans.create", () => createCarePlan(request, env.DB, session, clientId));
          }
          if (module === "risks") {
            if (request.method === "GET") return await permitted(env.DB, session, "risks.view", () => listRisks(env.DB, session, clientId));
            if (request.method === "POST") return await permitted(env.DB, session, "risks.manage", () => createRisk(request, env.DB, session, clientId));
          }
          if (module === "documents") {
            if (request.method === "GET") return await permitted(env.DB, session, "documents.view", () => listDocuments(env.DB, session, clientId));
            if (request.method === "POST") return await permitted(env.DB, session, "documents.manage", () => createDocument(request, env.DB, session, clientId));
          }
          return methodNotAllowed(["GET", "POST"]);
        }
        const carePlanMatch = url.pathname.match(/^\/api\/care-plans\/([^/]+)$/);
        if (carePlanMatch) {
          const id = decodeURIComponent(carePlanMatch[1]);
          if (request.method === "PUT") return await permitted(env.DB, session, "care_plans.edit", () => updateCarePlan(request, env.DB, session, id));
          if (request.method === "DELETE") return await permitted(env.DB, session, "care_plans.archive", () => archiveCarePlan(env.DB, session, id));
          return methodNotAllowed(["PUT", "DELETE"]);
        }
        const riskMatch = url.pathname.match(/^\/api\/risks\/([^/]+)$/);
        if (riskMatch) {
          const id = decodeURIComponent(riskMatch[1]);
          if (request.method === "PUT") return await permitted(env.DB, session, "risks.manage", () => updateRisk(request, env.DB, session, id));
          return methodNotAllowed(["PUT"]);
        }
        const documentFileMatch = url.pathname.match(/^\/api\/documents\/([^/]+)\/file$/);
        if (documentFileMatch && request.method === "GET") return documentFile(env, session, decodeURIComponent(documentFileMatch[1]));
        const documentMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
        if (documentMatch) {
          const id = decodeURIComponent(documentMatch[1]);
          if (request.method === "DELETE") return await permitted(env.DB, session, "documents.manage", () => archiveDocument(env.DB, session, id));
          return methodNotAllowed(["DELETE"]);
        }
        if (url.pathname === "/api/clients") {
          if (request.method === "GET") return await permitted(env.DB, session, "clients.view", () => listClients(env.DB, session, url));
          if (request.method === "POST") return await permitted(env.DB, session, "clients.create", () => createClient(request, env, session));
          return methodNotAllowed(["GET", "POST"]);
        }
        const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
        if (clientMatch) {
          const id = decodeURIComponent(clientMatch[1]);
          if (request.method === "GET") return await permitted(env.DB, session, "clients.view", () => getClient(env.DB, session, id));
          if (request.method === "PUT") return await permitted(env.DB, session, "clients.edit", () => updateClient(request, env, session, id));
          if (request.method === "DELETE") return await permitted(env.DB, session, "clients.archive", () => archiveClient(env.DB, session, id));
          return methodNotAllowed(["GET", "PUT", "DELETE"]);
        }
        if (url.pathname === "/api/users") {
          if (request.method === "GET") return await permitted(env.DB, session, "security.users.view", () => listUsers(env.DB, session));
          if (request.method === "POST") return createUser(request, env, session);
          return methodNotAllowed(["GET", "POST"]);
        }
        const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
        if (userMatch && request.method === "PUT") return updateUser(request, env, session, decodeURIComponent(userMatch[1]));
        if (url.pathname === "/api/audit" && request.method === "GET") return await permitted(env.DB, session, "security.audit.view", () => listAudit(env.DB, session, url));
        if (url.pathname === "/api/organisation" && request.method === "PUT") return await permitted(env.DB, session, "organisation.settings.manage", () => updateOrganisation(request, env.DB, session));
        return json({ error: { code: "API_ROUTE_NOT_FOUND", message: "The requested API route does not exist." } }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ message: "CoreCare request failed", requestId, method: request.method, path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: { code: "INTERNAL_ERROR", message: "CoreCare could not complete the request.", requestId } }, 500, { "x-request-id": requestId });
    }
  }
};

const PASSWORD_RESET_MINUTES=30;
const passwordResetResponse=()=>json({ok:true,message:'If an active account matches that email address, a reset link will be sent.'},202);
async function requestPasswordReset(request,env){
  if(!env.DB)return databaseRequired();
  const input=await readJson(request),email=clean(input.email).toLowerCase().slice(0,320);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return passwordResetResponse();
  const user=await env.DB.prepare(`SELECT u.id,u.organisation_id,u.email,u.display_name,u.access_level,o.name organisation_name FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE lower(u.email)=lower(?) AND u.status='active' AND o.status='active' LIMIT 1`).bind(email).first();
  if(!user)return passwordResetResponse();
  const ipHash=await sha256Base64(clean(request.headers.get('cf-connecting-ip'))||'unknown');
  const [byUser,byIp]=await Promise.all([env.DB.prepare("SELECT COUNT(*) total FROM password_reset_tokens WHERE user_id=? AND created_at>=datetime('now','-1 hour')").bind(user.id).first(),env.DB.prepare("SELECT COUNT(*) total FROM password_reset_tokens WHERE request_ip_hash=? AND created_at>=datetime('now','-1 hour')").bind(ipHash).first()]);
  if(Number(byUser?.total||0)>=3||Number(byIp?.total||0)>=10)return passwordResetResponse();
  const id=crypto.randomUUID(),token=randomToken(),expiresAt=new Date(Date.now()+PASSWORD_RESET_MINUTES*60_000).toISOString();
  await env.DB.batch([env.DB.prepare('INSERT INTO password_reset_tokens(id,user_id,token_hash,request_ip_hash,expires_at) VALUES(?,?,?,?,?)').bind(id,user.id,await sha256Base64(token),ipHash,expiresAt),auditStatement(env.DB,user.organisation_id,user.id,'user.password_reset_requested','user',user.id,{expiresAt})]);
  const actionUrl=new URL(request.url);actionUrl.pathname='/';actionUrl.search='';actionUrl.hash='';actionUrl.searchParams.set('reset',token);
  await sendCareAccountEmail(env,{organisation_id:user.organisation_id,user_id:user.id},{templateKey:'password_reset_link',sourceEventId:`care-password-reset:${id}`,userId:user.id,recipientEmail:user.email,recipientName:user.display_name,accessLabel:clean(user.access_level).replaceAll('_',' '),actionUrl:actionUrl.toString()});
  return passwordResetResponse();
}
async function resetPasswordWithToken(request,env){
  if(!env.DB)return databaseRequired();
  const input=await readJson(request),token=String(input.token||''),password=String(input.newPassword||input.password||'');
  if(token.length<32||token.length>256)return json({error:{code:'RESET_LINK_INVALID',message:'This password reset link is invalid or has expired.'}},400);
  if(!strongTemporaryPassword(password)||password.length>128)return json({error:{code:'WEAK_PASSWORD',message:'Use 12–128 characters with upper-case, lower-case and a number.'}},400);
  const record=await env.DB.prepare(`SELECT r.id reset_id,r.user_id,u.organisation_id,u.email,u.display_name,u.access_level FROM password_reset_tokens r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.consumed_at IS NULL AND datetime(r.expires_at)>CURRENT_TIMESTAMP AND u.status='active' LIMIT 1`).bind(await sha256Base64(token)).first();
  if(!record)return json({error:{code:'RESET_LINK_INVALID',message:'This password reset link is invalid or has expired.'}},400);
  const secured=await hashPassword(password),changedAt=new Date().toISOString();
  await env.DB.batch([env.DB.prepare('UPDATE password_reset_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL').bind(record.reset_id),env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(secured.hash,secured.salt,PASSWORD_ITERATIONS,record.user_id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.user_id),auditStatement(env.DB,record.organisation_id,record.user_id,'user.password_reset_completed','user',record.user_id,{})]);
  await sendCareAccountEmail(env,{organisation_id:record.organisation_id,user_id:record.user_id},{templateKey:'password_changed',sourceEventId:`care-password-reset:${record.reset_id}:completed`,userId:record.user_id,recipientEmail:record.email,recipientName:record.display_name,accessLabel:clean(record.access_level).replaceAll('_',' '),actionTime:changedAt});
  return json({ok:true,message:'Your password has been changed. Sign in with your new password.'});
}

export default {
  async fetch(request, env, context) {
    const response = await application.fetch(request, env, context);
    const audit = recordComplianceMutation(request, env, response, 'CARE');
    if (context?.waitUntil) context.waitUntil(audit); else await audit;
    return protectResponse(response, request);
  },
};

export class IdentityBroker extends WorkerEntrypoint {
  async accountExists(email) {
    const normalised = clean(email).toLowerCase().slice(0, 320);
    if (!normalised || !this.env.DB) return false;
    const row = await this.env.DB.prepare("SELECT u.id FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE lower(u.email)=lower(?) AND u.status='active' AND o.status='active' LIMIT 1").bind(normalised).first();
    return Boolean(row);
  }

  async createPortalGrant(input) {
    return createPortalLoginGrant(this.env, input);
  }
}

function health(env) {
  return json({ ok: true, service: "corecare", version: VERSION, environment: clean(env.ENVIRONMENT) || "production", database: Boolean(env.DB), authentication: Boolean(env.DB), platform: { configured: Boolean(env.CORECARE_PLATFORM && env.CORECARE_PRODUCT_KEY) }, timestamp: new Date().toISOString() });
}

async function runScheduledMaintenance(env, scheduledTime) {
  const startedAt = new Date(scheduledTime || Date.now()).toISOString();
  const work = [];
  if (env.DB) {
    work.push(env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP"),
      env.DB.prepare("DELETE FROM login_attempts WHERE updated_at<datetime('now','-1 day')"),
      env.DB.prepare("DELETE FROM password_reset_tokens WHERE datetime(expires_at)<datetime('now','-7 days')"),
      env.DB.prepare(`INSERT INTO operations_tasks(id,organisation_id,branch_id,client_id,title,description,category,priority,status,due_at,created_by)
        SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),a.organisation_id,c.branch_id,a.client_id,'PRN effectiveness review: '||m.name,'Review the outcome of PRN administration '||a.id||' recorded at '||a.administered_at||'.','Medication','high','open',datetime('now'),a.recorded_by
        FROM medication_administrations a
        JOIN medications m ON m.id=a.medication_id AND m.organisation_id=a.organisation_id
        JOIN clients c ON c.id=a.client_id AND c.organisation_id=a.organisation_id
        WHERE m.is_prn=1 AND a.is_void=0 AND a.outcome IN ('administered','prompted')
          AND COALESCE(a.prn_effectiveness,'')='' AND datetime(a.administered_at)<=datetime('now','-2 hours')
          AND NOT EXISTS (SELECT 1 FROM operations_tasks t WHERE t.organisation_id=a.organisation_id AND t.category='Medication' AND t.status IN ('open','escalated') AND t.description LIKE '%'||a.id||'%')`)
    ]));
  }
  if (env.CORECARE_PLATFORM) work.push(syncPlatformEntitlements(env));
  if (env.CORECARE_PLATFORM && env.DB) work.push(retryPendingCareSupportTickets(env));
  const results = await Promise.allSettled(work);
  const failures = results.filter(result => result.status === "rejected").map(result => String(result.reason));
  const event = { message: "scheduled maintenance completed", scheduledAt: startedAt, jobs: results.length, failures };
  if (failures.length) console.error(JSON.stringify(event)); else console.log(JSON.stringify(event));
  return { ok: failures.length === 0, ...event };
}

async function maybeRunScheduledMaintenance(env, scheduledTime = Date.now()) {
  if (!env.DB) return { ok: false, skipped: true, reason: "database_not_configured" };
  const claimed = await env.DB.prepare(`UPDATE system_maintenance_state
    SET last_started_at=CURRENT_TIMESTAMP,status='running',error_message=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE job_key='hourly' AND (last_started_at IS NULL OR datetime(last_started_at)<=datetime('now','-55 minutes'))
    RETURNING job_key,last_started_at`).first();
  if (!claimed) return { ok: true, skipped: true, reason: "already_run" };
  try {
    const result = await runScheduledMaintenance(env, scheduledTime);
    const status = result.ok ? "succeeded" : "failed";
    const errorMessage = result.failures?.length ? result.failures.join(" | ").slice(0, 1_000) : null;
    await env.DB.prepare(`UPDATE system_maintenance_state
      SET last_completed_at=CURRENT_TIMESTAMP,status=?,error_message=?,updated_at=CURRENT_TIMESTAMP
      WHERE job_key='hourly'`).bind(status, errorMessage).run();
    return result;
  } catch (error) {
    const message = clean(error?.message || error).slice(0, 1_000);
    await env.DB.prepare(`UPDATE system_maintenance_state
      SET last_completed_at=CURRENT_TIMESTAMP,status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP
      WHERE job_key='hourly'`).bind(message).run().catch(() => null);
    console.error(JSON.stringify({ message: "scheduled maintenance failed", error: message }));
    return { ok: false, skipped: false, failures: [message] };
  }
}

function portalOriginAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.origin === "https://www.corecaresystems.co.uk" || url.origin === "https://corecaresystems.co.uk" || (["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol === "http:");
  } catch { return false; }
}

function portalReturnPath(value) {
  const path = String(value || "/").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

async function portalLogin(request, env, productCode) {
  if (!portalOriginAllowed(request)) return json({ error: { code: "INVALID_ORIGIN", message: "This sign-in request was not sent by CoreCare Systems." } }, 403);
  let form;
  try { form = new URLSearchParams(await readText(request, 16_384)); } catch { return json({ error: { code: "VALIDATION_ERROR", message: "Enter an email address and password." } }, 400); }
  const email = clean(form.get("email")).toLowerCase().slice(0, 240);
  const password = String(form.get("password") || "");
  const failure = () => new Response(null, { status: 303, headers: { location: `https://www.corecaresystems.co.uk/login?product=${productCode}&error=invalid_credentials`, "cache-control": "no-store" } });
  if (!email || !password || password.length > 1024) return failure();
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");
  const result = await login(new Request(request.url, { method: "POST", headers, body: JSON.stringify({ email, password }) }), env);
  if (!result.ok) return failure();
  const cookie = result.headers.get("set-cookie");
  if (!cookie) return json({ error: { code: "SESSION_NOT_CREATED", message: "CoreCare could not create a sign-in session." } }, 502);
  return new Response(null, { status: 303, headers: { location: portalReturnPath(form.get("returnTo")), "set-cookie": cookie.replace(/SameSite=Strict/i, "SameSite=Lax"), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

function sessionTokenFromResponse(response) {
  const match = (response.headers.get("set-cookie") || "").match(/(?:^|,\s*)corecare_session=([^;,\s]+)/i);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}

async function createPortalLoginGrant(env, input = {}) {
  const email = clean(input.email).toLowerCase().slice(0, 320);
  const password = String(input.password || "");
  if (!email || !password || password.length > 1024 || !env.DB) return { ok: false, status: 401 };
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json",
    "cf-connecting-ip": clean(input.ip).slice(0, 64) || "portal-broker",
    "user-agent": clean(input.userAgent).slice(0, 250) || "CoreCare-Portal-Broker/1.0",
  });
  const result = await login(new Request("https://care.internal/api/auth/login", { method: "POST", headers, body: JSON.stringify({ email, password }) }), env);
  const token = sessionTokenFromResponse(result);
  if (!result.ok || !token) return { ok: false, status: result.status };
  const tokenHash = await sha256Base64(token);
  const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
  await env.DB.prepare("INSERT INTO portal_login_grants(token_hash,expires_at) VALUES(?,?)").bind(tokenHash, expiresAt).run();
  return { ok: true, grant: token, expiresAt };
}

async function claimPortalGrant(request, env, productCode) {
  if (!portalOriginAllowed(request)) return json({ error: { code: "INVALID_ORIGIN", message: "This sign-in request was not sent by CoreCare Systems." } }, 403);
  const failure = () => new Response(null, { status: 303, headers: { location: `https://www.corecaresystems.co.uk/login?product=${productCode}&error=invalid_credentials`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  let raw; try { raw = await readText(request, 8_192); } catch { return failure(); }
  const form = new URLSearchParams(raw);
  const grant = String(form.get("grant") || "");
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(grant)) return failure();
  const tokenHash = await sha256Base64(grant);
  const claimed = await env.DB.prepare("UPDATE portal_login_grants SET consumed_at=CURRENT_TIMESTAMP WHERE token_hash=? AND consumed_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP RETURNING token_hash").bind(tokenHash).first();
  if (!claimed) return failure();
  const session = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token_hash=? AND datetime(expires_at)>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
  if (!session) return failure();
  return new Response(null, { status: 303, headers: { location: portalReturnPath(form.get("returnTo")), "set-cookie": sessionCookie(grant, new Date(session.expires_at)), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

async function login(request, env) {
  if (!env.DB) return databaseRequired("Authentication requires the D1 database binding named DB.");
  const input = await readJson(request);
  const email = clean(input.email).toLowerCase();
  const password = String(input.password || "");
  if (!email || !password) return json({ error: { code: "VALIDATION_ERROR", message: "Enter an email address and password." } }, 400);

  const ip = clean(request.headers.get("cf-connecting-ip")).slice(0, 64) || "unknown";
  const attemptKey = await sha256Base64(`${email}|${ip}`);
  const attempt = await env.DB.prepare("SELECT attempt_count,window_started_at,locked_until FROM login_attempts WHERE attempt_key=?").bind(attemptKey).first();
  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    return json({ error: { code: "ACCOUNT_TEMPORARILY_LOCKED", message: "Too many unsuccessful attempts. Try again in 15 minutes." } }, 429);
  }

  const user = await env.DB.prepare(`SELECT u.id,u.organisation_id,u.email,u.display_name,u.role,u.access_level,u.is_platform_user,u.home_branch_id,u.status,u.password_hash,u.password_salt,u.password_iterations,u.must_change_password,o.name AS organisation_name,o.status AS organisation_status,COALESCE(p.session_hours,12) AS session_hours FROM users u JOIN organisations o ON o.id=u.organisation_id LEFT JOIN organisation_security_policies p ON p.organisation_id=u.organisation_id WHERE lower(u.email)=lower(?) LIMIT 1`).bind(email).first();
  const valid = user && user.status === "active" && user.organisation_status === "active" && user.password_hash && user.password_salt
    ? await verifyPassword(password, user.password_salt, user.password_hash, user.password_iterations || PASSWORD_ITERATIONS)
    : false;
  if (!valid) {
    await recordFailedLogin(env.DB, attemptKey, email, ip, attempt);
    return json({ error: { code: "INVALID_CREDENTIALS", message: "The email address or password is incorrect." } }, 401);
  }

  user.subscription_access=await currentSubscriptionAccess(env,user.organisation_id);
  if(user.subscription_access.mode==='locked')return json({error:{code:'SUBSCRIPTION_REQUIRED',message:'This subscription needs attention. Contact your CoreCare owner or support to restore access.'}},402);

  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  const token = randomToken();
  const tokenHash = await sha256Base64(token);
  const sessionHours = Math.max(1, Math.min(168, Number(user.session_hours) || SESSION_HOURS));
  const expires = new Date(Date.now() + sessionHours * 3600000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.DB.prepare("INSERT INTO sessions (id,user_id,organisation_id,active_branch_id,token_hash,expires_at,user_agent,ip_hint) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), user.id, user.organisation_id, user.home_branch_id, tokenHash, expires.toISOString(), clean(request.headers.get("user-agent")).slice(0, 250), ip),
    env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id),
    env.DB.prepare("INSERT INTO login_history(id,organisation_id,user_id,outcome,reason,ip_hint,user_agent) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user.organisation_id,user.id,"success","Password sign-in",ip,clean(request.headers.get("user-agent")).slice(0,250)),
    auditStatement(env.DB, user.organisation_id, user.id, "user.login", "user", user.id, { email: user.email })
  ]);
  const access=await buildAccessProfile(env.DB,{...user,user_id:user.id,active_branch_id:user.home_branch_id});
  return json({ user: {...publicUser(user),permissions:access.permissions,modules:access.modules}, expiresAt: expires.toISOString() }, 200, { "set-cookie": sessionCookie(token, expires) });
}

async function recordFailedLogin(db, key, email, ip, attempt) {
  const now = Date.now();
  const windowStart = attempt?.window_started_at ? new Date(attempt.window_started_at).getTime() : 0;
  const within = now - windowStart < LOGIN_WINDOW_MINUTES * 60000;
  const count = within ? (attempt?.attempt_count || 0) + 1 : 1;
  const lock = count >= MAX_LOGIN_ATTEMPTS ? new Date(now + LOGIN_WINDOW_MINUTES * 60000).toISOString() : null;
  await db.prepare(`INSERT INTO login_attempts (attempt_key,email,ip_hint,attempt_count,window_started_at,locked_until,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(attempt_key) DO UPDATE SET email=excluded.email,ip_hint=excluded.ip_hint,attempt_count=excluded.attempt_count,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until,updated_at=CURRENT_TIMESTAMP`).bind(key, email, ip, count, within ? attempt.window_started_at : new Date(now).toISOString(), lock).run();
}

async function logout(request, env) {
  if (env.DB) {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256Base64(token)).run();
  }
  return json({ ok: true }, 200, { "set-cookie": expiredSessionCookie() });
}

async function sessionInfo(request, env) {
  if (!env.DB) return databaseRequired();
  const session = await requireSession(request, env);
  if (session instanceof Response) return session;
  const access = await buildAccessProfile(env.DB, session);
  return json({ user: {...publicUser(session), permissions: access.permissions, modules: access.modules}, expiresAt: session.expires_at });
}

async function currentSubscriptionAccess(env,organisationId){
  let access=await subscriptionAccess(env.CONTROL_DB,organisationId),updated=access.updatedAt?new Date(access.updatedAt).getTime():0;
  if(env.CORECARE_PLATFORM&&(['entitlement_unavailable','entitlement_stale'].includes(access.reason)||!updated||Date.now()-updated>5*60_000)){
    await syncPlatformEntitlements(env,{limit:100,force:true}).catch(()=>null);
    access=await subscriptionAccess(env.CONTROL_DB,organisationId);
  }
  return access;
}

async function subscriptionResourceLimitGuard(env,organisationId,resource){
  const limit=await subscriptionLimit(env.CONTROL_DB,organisationId,resource);
  if(limit===null)return null;
  const row=resource==='users'
    ? await env.DB.prepare("SELECT COUNT(*) count FROM users WHERE organisation_id=? AND status='active' AND COALESCE(is_platform_user,0)=0").bind(organisationId).first()
    : await env.DB.prepare("SELECT COUNT(*) count FROM clients WHERE organisation_id=? AND status<>'Archived' AND archived_at IS NULL").bind(organisationId).first();
  const current=Number(row?.count||0);
  if(current<limit)return null;
  const label=resource==='users'?'active users':'active clients';
  return json({error:{code:'SUBSCRIPTION_LIMIT_REACHED',message:`This subscription allows ${limit} ${label}. Disable or archive an existing record, choose a higher plan, or ask the CoreCare owner for an override.`,resource,limit,current}},409);
}

async function requireSession(request, env) {
  const db=env.DB;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return unauthorised();
  const row = await db.prepare(`SELECT s.id AS session_id,s.expires_at,s.last_seen_at,s.user_id,s.organisation_id,s.active_branch_id,s.support_mode,s.support_origin_organisation_id,s.support_started_at,COALESCE(p.idle_timeout_minutes,60) AS idle_timeout_minutes,
    (SELECT ss.reason FROM support_sessions ss WHERE ss.session_id=s.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS support_reason,
    (SELECT ss.access_mode FROM support_sessions ss WHERE ss.session_id=s.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS support_access_mode,
    u.email,u.display_name,u.role,u.access_level,u.is_platform_user,u.home_branch_id,u.staff_id,u.status,u.must_change_password,o.name AS organisation_name,o.status AS organisation_status,b.name AS branch_name
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN organisations o ON o.id=s.organisation_id LEFT JOIN branches b ON b.id=s.active_branch_id LEFT JOIN organisation_security_policies p ON p.organisation_id=s.organisation_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(await sha256Base64(token)).first();
  if (!row || row.status !== "active" || row.organisation_status !== "active") return unauthorised();
  if(!row.support_mode)row.subscription_access=await currentSubscriptionAccess(env,row.organisation_id);
  const idleMinutes = Math.max(5, Math.min(1440, Number(row.idle_timeout_minutes) || 60));
  if (row.last_seen_at && Date.now() - databaseTimestampMs(row.last_seen_at) > idleMinutes * 60000) {
    await db.batch([
      db.prepare("DELETE FROM sessions WHERE id=?").bind(row.session_id),
      db.prepare("INSERT INTO login_history(id,organisation_id,user_id,outcome,reason,ip_hint,user_agent) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), row.organisation_id, row.user_id, "expired", "Idle timeout", clean(request.headers.get("cf-connecting-ip")).slice(0,64), clean(request.headers.get("user-agent")).slice(0,250)),
      auditStatement(db, row.organisation_id, row.user_id, "security.session_idle_expired", "session", row.session_id, { idleMinutes })
    ]);
    return unauthorised("Your session expired after a period of inactivity. Sign in again.");
  }
  await db.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.session_id).run();
  return row;
}

async function changePassword(request, env, session) {
  const db = env.DB;
  const input = await readJson(request);
  const current = String(input.currentPassword || "");
  const next = String(input.newPassword || "");
  if (next.length < 12 || !/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/[0-9]/.test(next)) {
    return json({ error: { code: "WEAK_PASSWORD", message: "Use at least 12 characters with upper-case, lower-case and a number." } }, 400);
  }
  const user = await db.prepare("SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?").bind(session.user_id).first();
  if (!user || !await verifyPassword(current, user.password_salt, user.password_hash, user.password_iterations || PASSWORD_ITERATIONS)) {
    return json({ error: { code: "CURRENT_PASSWORD_INCORRECT", message: "The current password is incorrect." } }, 400);
  }
  const secured = await hashPassword(next);
  await db.batch([
    db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(secured.hash, secured.salt, PASSWORD_ITERATIONS, session.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(session.user_id, session.session_id),
    auditStatement(db, session.organisation_id, session.user_id, "user.password_changed", "user", session.user_id, {})
  ]);
  const emailDelivery=await sendCareAccountEmail(env,session,{templateKey:'password_changed',sourceEventId:`care-user:${session.user_id}:password-changed:${crypto.randomUUID()}`,userId:session.user_id,recipientEmail:session.email,recipientName:session.display_name,accessLabel:session.access_level.replaceAll('_',' '),actionTime:new Date().toISOString()});
  return json({ ok: true, emailDelivery });
}

function branchRestricted(session){ return !session.is_platform_user && ['assigned_branch','assigned_work'].includes(roleScope(session.access_level)) && Boolean(session.active_branch_id || session.home_branch_id); }
function activeBranch(session){ return session.active_branch_id || session.home_branch_id || null; }

function mutationOriginAllowed(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function enforceBranchScope(request, db, session, url) {
  if (!branchRestricted(session)) return null;
  const branchId = activeBranch(session);
  if (!branchId) return forbidden("Your account is not assigned to an active branch.");

  const scoped = async (table, id, branchColumn = "branch_id") => Boolean(await db.prepare(`SELECT id FROM ${table} WHERE id=? AND organisation_id=? AND ${branchColumn}=? LIMIT 1`).bind(id, session.organisation_id, branchId).first());
  const scopedViaClient = async (table, id, clientColumn = "client_id") => Boolean(await db.prepare(`SELECT r.id FROM ${table} r JOIN clients c ON c.id=r.${clientColumn} AND c.organisation_id=r.organisation_id WHERE r.id=? AND r.organisation_id=? AND c.branch_id=? LIMIT 1`).bind(id, session.organisation_id, branchId).first());
  const scopedClient = async id => Boolean(await db.prepare("SELECT id FROM clients WHERE id=? AND organisation_id=? AND branch_id=? AND archived_at IS NULL LIMIT 1").bind(id, session.organisation_id, branchId).first());
  const scopedStaff = async id => Boolean(await db.prepare("SELECT id FROM staff WHERE id=? AND organisation_id=? AND branch_id=? AND status='Active' LIMIT 1").bind(id, session.organisation_id, branchId).first());

  const pathChecks = [
    [/^\/api\/clients\/([^/]+)\/(?:care-plans|risks|documents|visit-requirements)(?:\/upload)?$/, id => scopedClient(id)],
    [/^\/api\/care-plans\/([^/]+)(?:\/(?:approve|generate-visits|history))?$/, id => scoped("care_plans", id)],
    [/^\/api\/risks\/([^/]+)$/, id => scoped("risk_assessments", id)],
    [/^\/api\/documents\/([^/]+)(?:\/file)?$/, id => scoped("client_documents", id)],
    [/^\/api\/body-map\/([^/]+)\/update$/, id => scopedViaClient("body_map_records", id)],
    [/^\/api\/medication\/administrations\/([^/]+)\/correct$/, id => scopedViaClient("medication_administrations", id)],
    [/^\/api\/medication\/([^/]+)\/(?:administer|stock)$/, id => scopedViaClient("medications", id)],
    [/^\/api\/visits\/([^/]+)\/care-record$/, id => scoped("care_visits", id)],
    [/^\/api\/rota\/(?!templates(?:\/|$)|publish$)([^/]+)(?:\/(?:recurrence|cancel))?$/, id => scoped("care_visits", id)],
    [/^\/api\/rota\/templates\/visit\/([^/]+)$/, async id => Boolean(await db.prepare("SELECT t.id FROM rota_visit_templates t JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id WHERE t.id=? AND t.organisation_id=? AND c.branch_id=? LIMIT 1").bind(id,session.organisation_id,branchId).first())],
    [/^\/api\/rota\/templates\/working-pattern\/([^/]+)$/, async id => Boolean(await db.prepare("SELECT w.id FROM staff_working_patterns w JOIN staff s ON s.id=w.staff_id AND s.organisation_id=w.organisation_id WHERE w.id=? AND w.organisation_id=? AND s.branch_id=? LIMIT 1").bind(id,session.organisation_id,branchId).first())],
    [/^\/api\/rota\/templates\/exception\/([^/]+)$/, async id => Boolean(await db.prepare("SELECT e.id FROM rota_template_exceptions e LEFT JOIN clients c ON c.id=e.client_id AND c.organisation_id=e.organisation_id LEFT JOIN staff s ON s.id=e.staff_id AND s.organisation_id=e.organisation_id LEFT JOIN staff r ON r.id=e.replacement_staff_id AND r.organisation_id=e.organisation_id LEFT JOIN rota_visit_templates t ON t.id=e.template_id AND t.organisation_id=e.organisation_id LEFT JOIN clients tc ON tc.id=t.client_id AND tc.organisation_id=t.organisation_id WHERE e.id=? AND e.organisation_id=? AND COALESCE(c.branch_id,s.branch_id,r.branch_id,tc.branch_id)=? LIMIT 1").bind(id,session.organisation_id,branchId).first())],
    [/^\/api\/operations\/tasks\/([^/]+)\/(?:complete|escalate)$/, id => scoped("operations_tasks", id)],
    [/^\/api\/operations\/incidents\/([^/]+)\/review$/, id => scoped("operations_incidents", id)],
    [/^\/api\/operations\/handovers\/([^/]+)\/acknowledge$/, id => scoped("shift_handovers", id)],
    [/^\/api\/care-delivery\/alerts\/([^/]+)\/acknowledge$/, async id => Boolean(await db.prepare("SELECT a.id FROM care_delivery_alerts a JOIN clients c ON c.id=a.client_id AND c.organisation_id=a.organisation_id WHERE a.id=? AND a.organisation_id=? AND c.branch_id=? LIMIT 1").bind(id, session.organisation_id, branchId).first())]
  ];
  for (const [pattern, check] of pathChecks) {
    const match = url.pathname.match(pattern);
    if (match && !await check(decodeURIComponent(match[1]))) return forbidden("This record belongs to another branch.");
  }

  const queryClientId = clean(url.searchParams.get("clientId"));
  if (queryClientId && !await scopedClient(queryClientId)) return forbidden("This client belongs to another branch.");

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && (request.headers.get("content-type") || "").includes("application/json")) {
    const input = await readJson(request.clone());
    for (const field of ["clientId"]) if (clean(input[field]) && !await scopedClient(clean(input[field]))) return forbidden("The selected client belongs to another branch.");
    for (const field of ["staffId", "preferredStaffId", "backupStaffId", "replacementStaffId"]) if (clean(input[field]) && !await scopedStaff(clean(input[field]))) return forbidden("The selected staff member belongs to another branch.");
    if (url.pathname === "/api/medication" && clean(input.id) && !await scopedViaClient("medications", clean(input.id))) return forbidden("This medication record belongs to another branch.");
  }
  return null;
}
const CLIENT_COLUMNS = `id,first_name,last_name,preferred_name,date_of_birth,nhs_number,address_line_1,address_line_2,town,postcode,phone,email,care_package,next_review,status,risk,gp_name,gp_practice,gp_phone,next_of_kin_name,next_of_kin_relationship,next_of_kin_phone,emergency_contact_name,emergency_contact_phone,allergies,communication_needs,capacity_notes,important_notes,archived_at,created_at,updated_at`;

async function listClients(db, session, url) {
  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const sql = `SELECT ${CLIENT_COLUMNS} FROM clients WHERE organisation_id=? ${branchRestricted(session) ? "AND branch_id=?" : ""} ${includeArchived ? "" : "AND status<>'Archived'"} ORDER BY last_name COLLATE NOCASE,first_name COLLATE NOCASE`;
  const result = await db.prepare(sql).bind(session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).all();
  return json({ clients: result.results.map(toClient) });
}

async function getClient(db, session, id) {
  const row = await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?"AND branch_id=?":""} LIMIT 1`).bind(id, session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();
  if (!row) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
  return json({ client: toClient(row) });
}

async function createClient(request, env, session) {
  const db=env.DB;
  const raw = await readJson(request);
  const input = normaliseClient(raw);
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  if(input.status!=='Archived'){
    const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'clients');
    if(limitError)return limitError;
  }
  const id = crypto.randomUUID();
  const fields = clientFields(input);
  const requirements = normaliseVisitRequirements(raw.visitRequirements, raw.visitStartDate);
  const statements = [
    db.prepare(`INSERT INTO clients (id,organisation_id,branch_id,${fields.names.join(",")}) VALUES (?, ?, ?, ${fields.names.map(() => "?").join(",")})`).bind(id, session.organisation_id, activeBranch(session), ...fields.values),
    db.prepare(`INSERT INTO client_visit_codes(id,organisation_id,client_id,code,active,created_by,expires_at) VALUES(?,?,?,?,1,?,datetime('now','+90 days'))`).bind(crypto.randomUUID(),session.organisation_id,id,'CC-'+crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase(),session.user_id),
    auditStatement(db, session.organisation_id, session.user_id, "client.created", "client", id, { name: `${input.firstName} ${input.lastName}` })
  ];
  statements.push(...clientOnboardingStatements(db, session, id, input));
  for (const requirement of requirements) statements.push(...visitRequirementStatements(db, session, id, requirement));
  await db.batch(statements);
  return json({ client: { ...input, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, requirementsCreated: requirements.length, visitsGenerated: requirements.reduce((n,r)=>n+generatedOccurrenceCount(r),0) }, 201);
}


function normaliseVisitRequirements(value, fallbackStartDate) {
  if (!Array.isArray(value)) return [];
  const fallback = clean(fallbackStartDate) || new Date().toISOString().slice(0,10);
  return value.map(item => ({
    visitType: clean(item.visitType) || 'Personal care',
    days: Array.isArray(item.days) ? item.days.map(Number).filter(n => n >= 0 && n <= 6) : [1,2,3,4,5,6,0],
    preferredTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(clean(item.preferredTime)) ? clean(item.preferredTime) : '08:00',
    windowMinutes: Math.max(0, Math.min(240, Number(item.windowMinutes) || 60)),
    schedulingRule: ['flexible','window','fixed'].includes(clean(item.schedulingRule)) ? clean(item.schedulingRule) : ((Number(item.windowMinutes)||60)===0?'fixed':'flexible'),
    timeCriticalReason: clean(item.timeCriticalReason),
    durationMinutes: Math.max(15, Math.min(480, Number(item.durationMinutes) || 30)),
    carersRequired: Math.max(1, Math.min(4, Number(item.carersRequired) || 1)),
    notes: clean(item.notes),
    startDate: clean(item.startDate) || fallback,
    endDate: clean(item.endDate) || null
  })).filter(r => r.days.length);
}
function generatedDates(requirement, weeks=8) {
  const dates=[]; const start=new Date(`${requirement.startDate}T12:00:00`); const endLimit=requirement.endDate?new Date(`${requirement.endDate}T23:59:59`):new Date(start.getTime()+weeks*7*86400000);
  for(let d=new Date(start);d<=endLimit;d.setDate(d.getDate()+1)){if(requirement.days.includes(d.getDay()))dates.push(new Date(d));}
  return dates;
}
function generatedOccurrenceCount(requirement){return generatedDates(requirement).length;}
function visitRequirementStatements(db, session, clientId, requirement) {
  const requirementId=crypto.randomUUID();
  const statements=[db.prepare(`INSERT INTO client_visit_requirements(id,organisation_id,client_id,visit_type,days_json,preferred_time,window_minutes,duration_minutes,carers_required,notes,start_date,end_date,created_by,scheduling_rule,time_critical_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(requirementId,session.organisation_id,clientId,requirement.visitType,JSON.stringify(requirement.days),requirement.preferredTime,requirement.windowMinutes,requirement.durationMinutes,requirement.carersRequired,requirement.notes,requirement.startDate,requirement.endDate,session.user_id,requirement.schedulingRule,requirement.timeCriticalReason)];
  for(const date of generatedDates(requirement)){
    const day=date.toISOString().slice(0,10), start=new Date(`${day}T${requirement.preferredTime}:00`), end=new Date(start.getTime()+requirement.durationMinutes*60000);
    statements.push(db.prepare(`INSERT OR IGNORE INTO care_visits(id,organisation_id,branch_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,requirement_id,requirement_occurrence_date,created_by,protected_time_rule,protected_time_reason,protected_window_minutes) VALUES(?, ?, (SELECT branch_id FROM clients WHERE id=? AND organisation_id=?), ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,clientId,session.organisation_id,clientId,null,requirement.visitType,start.toISOString(),end.toISOString(),'scheduled','requirement','draft',requirementId,'requirement',requirementId,day,session.user_id,requirement.schedulingRule,requirement.timeCriticalReason,requirement.windowMinutes));
  }
  return statements;
}
function clientOnboardingStatements(db,session,clientId,input){
  const due=new Date(Date.now()+3*86400000).toISOString();
  const items=[['assessment','Complete initial assessment','critical'],['care_plan','Complete and approve care plan','critical'],['risk_assessment','Complete risk assessments','critical'],['medication','Complete medication assessment','warning'],['consent','Record consent and key documents','warning'],['funding','Confirm funding and invoicing details','warning'],['visit_requirements','Review visit requirements','warning']];
  const clientName=`${input.firstName} ${input.lastName}`;
  const st=[];
  for(const [key,title,severity] of items){
    st.push(db.prepare(`INSERT INTO client_onboarding_items(id,organisation_id,client_id,item_key,title,severity,due_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,clientId,key,title,severity,due));
    st.push(db.prepare(`INSERT INTO operations_tasks(id,organisation_id,branch_id,client_id,title,description,category,priority,status,due_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,activeBranch(session),clientId,`${title}: ${clientName}`,'Automatically created during client onboarding.','Onboarding',severity==='critical'?'high':'normal','open',due,session.user_id));
  }
  st.push(db.prepare(`INSERT INTO notifications(id,organisation_id,category,priority,title,message,source,source_id,action_url) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,'care','warning',`New client onboarding: ${clientName}`,'Visit requirements have been sent to the allocation queue. Complete the assessment, care plan and risk assessments before publishing care.','client_onboarding',clientId,'#clients'));
  return st;
}
async function listVisitRequirements(db,session,clientId){
  const rows=await db.prepare(`SELECT * FROM client_visit_requirements WHERE organisation_id=? AND client_id=? AND status='active' ORDER BY preferred_time`).bind(session.organisation_id,clientId).all();
  return json({requirements:(rows.results||[]).map(r=>({...r,days:JSON.parse(r.days_json||'[]')}))});
}
async function saveVisitRequirements(request,db,session,clientId){
  const input=await readJson(request),requirements=normaliseVisitRequirements(input.requirements,input.startDate);
  if(!requirements.length)return json({error:{code:'VALIDATION_ERROR',message:'Add at least one valid visit requirement.'}},400);
  const client=await db.prepare('SELECT id FROM clients WHERE id=? AND organisation_id=?').bind(clientId,session.organisation_id).first();if(!client)return notFound('Client');
  const statements=[];
  for(const r of requirements)statements.push(...visitRequirementStatements(db,session,clientId,r));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'client.visit_requirements_created','client',clientId,{count:requirements.length}));
  await db.batch(statements);return json({ok:true,requirementsCreated:requirements.length,visitsGenerated:requirements.reduce((n,r)=>n+generatedOccurrenceCount(r),0)});
}

async function updateClient(request, env, session, id) {
  const db=env.DB;
  const raw = await readJson(request);
  const input = normaliseClient(raw);
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const fields = clientFields(input);
  const assignments = fields.names.map(name => `${name}=?`).join(",");
  const existing = await db.prepare(`SELECT id,status,archived_at FROM clients WHERE id=? AND organisation_id=? LIMIT 1`).bind(id,session.organisation_id).first();
  if (!existing) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
  if(input.status!=='Archived'&&(existing.status==='Archived'||existing.archived_at)){
    const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'clients');
    if(limitError)return limitError;
  }
  const statements=[db.prepare(`UPDATE clients SET ${assignments},archived_at=CASE WHEN ?='Archived' THEN COALESCE(archived_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(...fields.values,input.status,id,session.organisation_id)];
  let requirementsCreated=0,visitsGenerated=0;
  if(Array.isArray(raw.visitRequirements)){
    const requirements=normaliseVisitRequirements(raw.visitRequirements,raw.visitStartDate);
    statements.push(db.prepare(`DELETE FROM care_visits WHERE organisation_id=? AND client_id=? AND requirement_id IS NOT NULL AND status='scheduled' AND staff_id IS NULL AND datetime(scheduled_start)>=datetime('now')`).bind(session.organisation_id,id));
    statements.push(db.prepare(`UPDATE client_visit_requirements SET status='replaced',updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND client_id=? AND status='active'`).bind(session.organisation_id,id));
    for(const requirement of requirements)statements.push(...visitRequirementStatements(db,session,id,requirement));
    requirementsCreated=requirements.length;
    visitsGenerated=requirements.reduce((n,r)=>n+generatedOccurrenceCount(r),0);
    statements.push(auditStatement(db,session.organisation_id,session.user_id,'client.visit_requirements_replaced','client',id,{count:requirementsCreated,visitsGenerated}));
  }
  statements.push(auditStatement(db,session.organisation_id,session.user_id,"client.updated","client",id,{name:`${input.firstName} ${input.lastName}`}));
  await db.batch(statements);
  const response=await db.prepare(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=? AND organisation_id=? LIMIT 1`).bind(id,session.organisation_id).first();
  return json({client:toClient(response),requirementsCreated,visitsGenerated});
}

async function archiveClient(db, session, id) {
  const existing = await db.prepare("SELECT first_name,last_name FROM clients WHERE id=? AND organisation_id=?").bind(id, session.organisation_id).first();
  if (!existing) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
  await db.batch([
    db.prepare("UPDATE clients SET status='Archived',archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(id, session.organisation_id),
    auditStatement(db, session.organisation_id, session.user_id, "client.archived", "client", id, { name: `${existing.first_name} ${existing.last_name}` })
  ]);
  return json({ ok: true });
}

function clientFields(input) {
  const mapping = {
    first_name: input.firstName, last_name: input.lastName, preferred_name: input.preferredName,
    date_of_birth: input.dateOfBirth, nhs_number: input.nhsNumber, address_line_1: input.addressLine1,
    address_line_2: input.addressLine2, town: input.town, postcode: input.postcode, phone: input.phone,
    email: input.email, care_package: input.carePackage, next_review: input.nextReview, status: input.status,
    risk: input.risk, gp_name: input.gpName, gp_practice: input.gpPractice, gp_phone: input.gpPhone,
    next_of_kin_name: input.nextOfKinName, next_of_kin_relationship: input.nextOfKinRelationship,
    next_of_kin_phone: input.nextOfKinPhone, emergency_contact_name: input.emergencyContactName,
    emergency_contact_phone: input.emergencyContactPhone, allergies: input.allergies,
    communication_needs: input.communicationNeeds, capacity_notes: input.capacityNotes,
    important_notes: input.importantNotes
  };
  return { names: Object.keys(mapping), values: Object.values(mapping) };
}

function validateClient(input) {
  if (!input.firstName || !input.lastName || !input.town || !input.dateOfBirth || !input.nextReview) return "Complete all required client fields.";
  if (!/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(input.dateOfBirth) || !/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(input.nextReview)) return "Enter valid dates.";
  if (!['Active', 'Paused', 'Archived'].includes(input.status)) return "Choose a valid client status.";
  if (!['Standard', 'Medium', 'High'].includes(input.risk)) return "Choose a valid risk level.";
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) return "Enter a valid email address.";
  return null;
}

function normaliseClient(input) {
  const textFields = ["firstName","lastName","preferredName","nhsNumber","addressLine1","addressLine2","town","postcode","phone","email","carePackage","gpName","gpPractice","gpPhone","nextOfKinName","nextOfKinRelationship","nextOfKinPhone","emergencyContactName","emergencyContactPhone","allergies","communicationNeeds","capacityNotes","importantNotes"];
  const output = {};
  for (const field of textFields) output[field] = clean(input[field]);
  output.dateOfBirth = clean(input.dateOfBirth);
  output.nextReview = clean(input.nextReview);
  output.status = clean(input.status) || "Active";
  output.risk = clean(input.risk) || "Standard";
  return output;
}

function toClient(row) {
  return {
    id: row.id, firstName: row.first_name, lastName: row.last_name, preferredName: row.preferred_name || "",
    dateOfBirth: row.date_of_birth, nhsNumber: row.nhs_number || "", addressLine1: row.address_line_1 || "",
    addressLine2: row.address_line_2 || "", town: row.town, postcode: row.postcode || "", phone: row.phone || "",
    email: row.email || "", carePackage: row.care_package || "", nextReview: row.next_review, status: row.status,
    risk: row.risk, gpName: row.gp_name || "", gpPractice: row.gp_practice || "", gpPhone: row.gp_phone || "",
    nextOfKinName: row.next_of_kin_name || "", nextOfKinRelationship: row.next_of_kin_relationship || "",
    nextOfKinPhone: row.next_of_kin_phone || "", emergencyContactName: row.emergency_contact_name || "",
    emergencyContactPhone: row.emergency_contact_phone || "", allergies: row.allergies || "",
    communicationNeeds: row.communication_needs || "", capacityNotes: row.capacity_notes || "",
    importantNotes: row.important_notes || "", archivedAt: row.archived_at || null,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}




async function rotaBoard(db, session, url) {
  const org=session.organisation_id;
  const from=clean(url.searchParams.get('from'))||new Date().toISOString().slice(0,10);
  const to=clean(url.searchParams.get('to'))||new Date(Date.now()+6*86400000).toISOString().slice(0,10);
  const scoped=branchRestricted(session),branch=activeBranch(session);
  const [visits,clients,staff,patterns,requirements,assignments]=await Promise.all([
    db.prepare(`SELECT v.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name,
      (SELECT rt.status FROM rota_visit_templates rt WHERE rt.id=v.template_id AND rt.organisation_id=v.organisation_id) recurrence_status,
      (SELECT rt.interval_weeks FROM rota_visit_templates rt WHERE rt.id=v.template_id AND rt.organisation_id=v.organisation_id) recurrence_interval_weeks,
      (SELECT rt.effective_from FROM rota_visit_templates rt WHERE rt.id=v.template_id AND rt.organisation_id=v.organisation_id) recurrence_effective_from,
      (SELECT rt.effective_to FROM rota_visit_templates rt WHERE rt.id=v.template_id AND rt.organisation_id=v.organisation_id) recurrence_effective_to,
      (SELECT rt.end_after_occurrences FROM rota_visit_templates rt WHERE rt.id=v.template_id AND rt.organisation_id=v.organisation_id) recurrence_end_after_occurrences,
      (SELECT GROUP_CONCAT(rt.day_of_week) FROM rota_visit_templates rt WHERE rt.series_id=v.recurrence_group_id AND rt.organisation_id=v.organisation_id) recurrence_days,
      CASE WHEN (SELECT rt.preferred_staff_id FROM rota_visit_templates rt WHERE rt.id=v.template_id AND rt.organisation_id=v.organisation_id) IS NULL THEN 0 ELSE 1 END recurrence_keep_carer,
      COALESCE(v.protected_time_rule,'flexible') protected_time_rule, v.protected_time_reason, COALESCE(v.protected_window_minutes,0) protected_window_minutes
      FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id
      WHERE v.organisation_id=? ${scoped?'AND v.branch_id=?':''} AND date(v.scheduled_start) BETWEEN date(?,'-1 day') AND date(?,'+1 day') AND v.rota_status!='cancelled'
      ORDER BY v.scheduled_start`).bind(org,...(scoped?[branch]:[]),from,to).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active' ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT w.* FROM staff_working_patterns w JOIN staff s ON s.id=w.staff_id AND s.organisation_id=w.organisation_id WHERE w.organisation_id=? ${scoped?'AND s.branch_id=?':''} AND w.status='active' ORDER BY w.staff_id,w.week_number,w.day_of_week,w.start_time`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT r.* FROM client_visit_requirements r JOIN clients c ON c.id=r.client_id AND c.organisation_id=r.organisation_id WHERE r.organisation_id=? ${scoped?'AND c.branch_id=?':''} AND r.status='active'`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT a.client_id,a.staff_id FROM client_staff_assignments a JOIN clients c ON c.id=a.client_id AND c.organisation_id=a.organisation_id WHERE a.organisation_id=? ${scoped?'AND c.branch_id=?':''}`).bind(org,...(scoped?[branch]:[])).all()
  ]);
  const rows=visits.results||[], now=Date.now();
  rows.forEach(v=>{const start=new Date(v.scheduled_start).getTime(),end=v.scheduled_end?new Date(v.scheduled_end).getTime():start+3600000;v.live_status=v.status==='scheduled'&&start<now?'late':v.status==='in_progress'&&end<now?'overrunning':v.status;});
  const serviceDay=value=>new Date(new Date(value).getTime()-6*60*60*1000).toISOString().slice(0,10),periodRows=rows.filter(row=>{const day=serviceDay(row.scheduled_start);return day>=from&&day<=to;});
  const publication=assessRotaPublication(periodRows);
  const stats={total:periodRows.length,unallocated:periodRows.filter(x=>!x.staff_id).length,late:periodRows.filter(x=>x.live_status==='late').length,inProgress:periodRows.filter(x=>x.status==='in_progress').length,completed:periodRows.filter(x=>x.status==='completed').length,draft:publication.draft,published:periodRows.filter(x=>String(x.rota_status||'published').toLowerCase()==='published').length,readyToPublish:publication.ready?publication.draft:0,unallocatedDraft:publication.unallocated,publicationBlockers:publication.blockers};
  return json({from,to,visits:rows,clients:clients.results||[],staff:staff.results||[],workingPatterns:patterns.results||[],requirements:requirements.results||[],preferredAssignments:assignments.results||[],stats});
}

async function listRotaTemplates(db,session){
  const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session);
  const [visitTemplates,patterns,exceptions,runs,clients,staff]=await Promise.all([
    db.prepare(`SELECT t.*,c.first_name||' '||c.last_name client_name,p.first_name||' '||p.last_name preferred_staff_name,b.first_name||' '||b.last_name backup_staff_name FROM rota_visit_templates t LEFT JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id LEFT JOIN staff p ON p.id=t.preferred_staff_id AND p.organisation_id=t.organisation_id LEFT JOIN staff b ON b.id=t.backup_staff_id AND b.organisation_id=t.organisation_id WHERE t.organisation_id=? ${scoped?'AND c.branch_id=?':''} ORDER BY t.day_of_week,t.preferred_time,c.last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT w.*,s.first_name||' '||s.last_name staff_name FROM staff_working_patterns w LEFT JOIN staff s ON s.id=w.staff_id AND s.organisation_id=w.organisation_id WHERE w.organisation_id=? ${scoped?'AND s.branch_id=?':''} ORDER BY s.last_name,w.week_number,w.day_of_week,w.start_time`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT e.*,s.first_name||' '||s.last_name staff_name,c.first_name||' '||c.last_name client_name,r.first_name||' '||r.last_name replacement_staff_name FROM rota_template_exceptions e LEFT JOIN staff s ON s.id=e.staff_id AND s.organisation_id=e.organisation_id LEFT JOIN clients c ON c.id=e.client_id AND c.organisation_id=e.organisation_id LEFT JOIN staff r ON r.id=e.replacement_staff_id AND r.organisation_id=e.organisation_id LEFT JOIN rota_visit_templates t ON t.id=e.template_id AND t.organisation_id=e.organisation_id LEFT JOIN clients tc ON tc.id=t.client_id AND tc.organisation_id=t.organisation_id WHERE e.organisation_id=? ${scoped?'AND COALESCE(c.branch_id,s.branch_id,tc.branch_id,r.branch_id)=?':''} AND datetime(COALESCE(e.end_at,e.start_at))>=datetime('now','-30 day') ORDER BY e.start_at DESC`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT * FROM rota_generation_runs WHERE organisation_id=? ${scoped?'AND branch_id=?':''} ORDER BY generated_at DESC LIMIT 12`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active' ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all()
  ]);
  return json({visitTemplates:visitTemplates.results||[],workingPatterns:patterns.results||[],exceptions:exceptions.results||[],runs:runs.results||[],clients:clients.results||[],staff:staff.results||[]});
}
async function saveRotaVisitTemplate(request,db,session){
  const i=await readJson(request),clientId=clean(i.clientId),time=clean(i.preferredTime),day=Number(i.dayOfWeek),duration=Math.max(15,Number(i.durationMinutes)||30);
  if(!clientId||!time||day<1||day>7)return json({error:{code:'VALIDATION_ERROR',message:'Select a client, day and preferred time.'}},400);
  const id=clean(i.id)||crypto.randomUUID();
  await db.batch([db.prepare(`INSERT INTO rota_visit_templates(id,organisation_id,client_id,name,visit_type,day_of_week,preferred_time,duration_minutes,carers_required,preferred_staff_id,backup_staff_id,window_minutes,effective_from,effective_to,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,name=excluded.name,visit_type=excluded.visit_type,day_of_week=excluded.day_of_week,preferred_time=excluded.preferred_time,duration_minutes=excluded.duration_minutes,carers_required=excluded.carers_required,preferred_staff_id=excluded.preferred_staff_id,backup_staff_id=excluded.backup_staff_id,window_minutes=excluded.window_minutes,effective_from=excluded.effective_from,effective_to=excluded.effective_to,status=excluded.status,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,clientId,clean(i.name)||'Recurring care visit',clean(i.visitType)||'Care visit',day,time,duration,Math.max(1,Number(i.carersRequired)||1),clean(i.preferredStaffId)||null,clean(i.backupStaffId)||null,Math.max(0,Number(i.windowMinutes)||15),clean(i.effectiveFrom)||null,clean(i.effectiveTo)||null,clean(i.status)||'active',clean(i.notes),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'rota.template_saved','rota_visit_template',id,{clientId,day,time})]);return json({ok:true,id});
}
async function saveWorkingPattern(request,db,session){
  const i=await readJson(request),staffId=clean(i.staffId),day=Number(i.dayOfWeek),start=clean(i.startTime),end=clean(i.endTime),cycle=Math.min(8,Math.max(1,Number(i.cycleWeeks)||1)),week=Math.min(cycle,Math.max(1,Number(i.weekNumber)||1));
  if(!staffId||day<1||day>7||!start||!end||end<=start)return json({error:{code:'VALIDATION_ERROR',message:'Select a carer, day and valid start/end times.'}},400);
  const id=clean(i.id)||crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO staff_working_patterns(id,organisation_id,staff_id,name,cycle_weeks,week_number,day_of_week,start_time,end_time,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET staff_id=excluded.staff_id,name=excluded.name,cycle_weeks=excluded.cycle_weeks,week_number=excluded.week_number,day_of_week=excluded.day_of_week,start_time=excluded.start_time,end_time=excluded.end_time,status=excluded.status,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,staffId,clean(i.name)||'Normal working pattern',cycle,week,day,start,end,clean(i.status)||'active',session.user_id),auditStatement(db,session.organisation_id,session.user_id,'rota.working_pattern_saved','staff_working_pattern',id,{staffId,day,start,end})]);return json({ok:true,id});
}
async function saveRotaException(request,db,session){
  const i=await readJson(request),start=clean(i.startAt),type=clean(i.exceptionType)||'other';if(!start)return json({error:{code:'VALIDATION_ERROR',message:'Enter the exception start date and time.'}},400);
  const id=clean(i.id)||crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO rota_template_exceptions(id,organisation_id,exception_type,staff_id,client_id,template_id,start_at,end_at,action,replacement_staff_id,reason,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET exception_type=excluded.exception_type,staff_id=excluded.staff_id,client_id=excluded.client_id,template_id=excluded.template_id,start_at=excluded.start_at,end_at=excluded.end_at,action=excluded.action,replacement_staff_id=excluded.replacement_staff_id,reason=excluded.reason`).bind(id,session.organisation_id,type,clean(i.staffId)||null,clean(i.clientId)||null,clean(i.templateId)||null,start,clean(i.endAt)||null,clean(i.action)||'exclude',clean(i.replacementStaffId)||null,clean(i.reason),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'rota.exception_saved','rota_exception',id,{type,start})]);return json({ok:true,id});
}
async function deleteRotaTemplateItem(db,session,type,id){
  const table=type==='visit'?'rota_visit_templates':type==='working-pattern'?'staff_working_patterns':'rota_template_exceptions';await db.batch([db.prepare(`DELETE FROM ${table} WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'rota.template_deleted',type,id,{})]);return json({ok:true});
}
function mondayOf(value){const d=new Date(`${value}T00:00:00`);const shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d;}
async function generateRotaFromTemplates(request,env,session){
  const db=env.DB;
  const i=await readJson(request),weekValue=clean(i.weekCommencing);if(!weekValue)return json({error:{code:'VALIDATION_ERROR',message:'Select a week to generate.'}},400);const week=mondayOf(weekValue),weekEnd=new Date(week);weekEnd.setDate(weekEnd.getDate()+7);const mode=['fill','regenerate'].includes(clean(i.mode))?clean(i.mode):'fill',scoped=branchRestricted(session),branch=activeBranch(session);
  if(mode==='regenerate')await db.prepare(`DELETE FROM care_visits WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND rota_source='template' AND status='scheduled' AND datetime(scheduled_start)>=datetime(?) AND datetime(scheduled_start)<datetime(?) AND COALESCE(manually_overridden,0)=0`).bind(session.organisation_id,...(scoped?[branch]:[]),week.toISOString(),weekEnd.toISOString()).run();
  const templates=(await db.prepare(`SELECT t.* FROM rota_visit_templates t JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id WHERE t.organisation_id=? ${scoped?'AND c.branch_id=?':''} AND t.status='active' ORDER BY t.day_of_week,t.preferred_time`).bind(session.organisation_id,...(scoped?[branch]:[])).all()).results||[];let created=0,skipped=0,unallocated=0;const warnings=[],statements=[];
  for(const t of templates){const day=new Date(week);day.setDate(day.getDate()+Number(t.day_of_week)-1);const date=day.toISOString().slice(0,10);if(t.effective_from&&date<t.effective_from){skipped++;continue}if(t.effective_to&&date>t.effective_to){skipped++;continue}const interval=Math.max(1,Number(t.interval_weeks)||1);if(interval>1&&t.effective_from){const origin=mondayOf(t.effective_from),weeks=Math.floor((week-origin)/(7*86400000));if(weeks<0||weeks%interval!==0){skipped++;continue}}if(Number(t.end_after_occurrences)>0){const made=await db.prepare(`SELECT COUNT(*) count FROM care_visits WHERE organisation_id=? AND template_id=? AND status!='cancelled'`).bind(session.organisation_id,t.id).first();if(Number(made?.count||0)>=Number(t.end_after_occurrences)){skipped++;continue}}
    const start=new Date(`${date}T${t.preferred_time}:00`),end=new Date(start.getTime()+Number(t.duration_minutes)*60000);
    const duplicate=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND template_id=? AND date(scheduled_start)=date(?) AND status!='cancelled' LIMIT 1`).bind(session.organisation_id,t.id,start.toISOString()).first();if(duplicate){skipped++;continue}
    const ex=await db.prepare(`SELECT * FROM rota_template_exceptions WHERE organisation_id=? AND (template_id=? OR client_id=? OR staff_id IN (?,?)) AND datetime(start_at)<=datetime(?) AND datetime(COALESCE(end_at,start_at,'9999-12-31'))>=datetime(?) ORDER BY created_at DESC LIMIT 1`).bind(session.organisation_id,t.id,t.client_id,t.preferred_staff_id||'',t.backup_staff_id||'',end.toISOString(),start.toISOString()).first();if(ex&&ex.action==='exclude'){skipped++;warnings.push(`${t.name}: skipped due to ${ex.exception_type}`);continue}
    let staffId=ex?.replacement_staff_id||t.preferred_staff_id||null;
    async function available(candidate){if(!candidate)return false;const clash=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND staff_id=? AND status!='cancelled' AND datetime(scheduled_start)<datetime(?) AND datetime(COALESCE(scheduled_end,scheduled_start))>datetime(?) LIMIT 1`).bind(session.organisation_id,candidate,end.toISOString(),start.toISOString()).first();if(clash)return false;const pattern=await db.prepare(`SELECT id FROM staff_working_patterns WHERE organisation_id=? AND staff_id=? AND status='active' AND day_of_week=? AND time(start_time)<=time(?) AND time(end_time)>=time(?) LIMIT 1`).bind(session.organisation_id,candidate,t.day_of_week,t.preferred_time,end.toISOString().slice(11,16)).first();return Boolean(pattern)}
    if(staffId&&!await available(staffId))staffId=t.backup_staff_id&&await available(t.backup_staff_id)?t.backup_staff_id:null;
    if(!staffId){unallocated++;warnings.push(`${t.name}: left in allocation queue`)}
    const id=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO care_visits(id,organisation_id,branch_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,template_id,published_at,created_by) VALUES(?, ?, (SELECT branch_id FROM clients WHERE id=? AND organisation_id=?), ?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).bind(id,session.organisation_id,t.client_id,session.organisation_id,t.client_id,staffId,t.visit_type,start.toISOString(),end.toISOString(),'scheduled','template','draft',t.id,'weekly_template',t.id,session.user_id));created++;
  }
  const runId=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO rota_generation_runs(id,organisation_id,branch_id,week_commencing,templates_considered,visits_created,visits_skipped,visits_unallocated,warnings_json,generated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(runId,session.organisation_id,scoped?branch:null,week.toISOString().slice(0,10),templates.length,created,skipped,unallocated,JSON.stringify(warnings),session.user_id));statements.push(auditStatement(db,session.organisation_id,session.user_id,'rota.week_generated','rota_generation',runId,{week:weekValue,created,skipped,unallocated,mode,branchId:scoped?branch:null}));if(statements.length)await db.batch(statements);
  const staffDays=(await db.prepare(`SELECT DISTINCT staff_id,date(scheduled_start) day FROM care_visits WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND staff_id IS NOT NULL AND datetime(scheduled_start)>=datetime(?) AND datetime(scheduled_start)<datetime(?)`).bind(session.organisation_id,...(scoped?[branch]:[]),week.toISOString(),weekEnd.toISOString()).all()).results||[];for(const x of staffDays)await recalculateStaffTravel(env,session,x.staff_id,x.day);
  return json({ok:true,runId,templates:templates.length,created,skipped,unallocated,warnings});
}

async function createRotaVisit(request,env,session){
  const db=env.DB;
  const i=await readJson(request),clientId=clean(i.clientId),start=clean(i.scheduledStart);
  if(!clientId||!start)return json({error:{code:'VALIDATION_ERROR',message:'Select a client and start time.'}},400);
  const staffId=clean(i.staffId)||null,end=clean(i.scheduledEnd)||null;
  const startTime=new Date(start).getTime(),endTime=new Date(end||'').getTime();
  if(!Number.isFinite(startTime)||!Number.isFinite(endTime)||endTime<=startTime)return json({error:{code:'VALIDATION_ERROR',message:'Enter a valid start and end time. The visit must end after it starts.'}},400);
  const client=await db.prepare(`SELECT id,branch_id FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND archived_at IS NULL`).bind(clientId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();
  if(!client)return json({error:{code:'CLIENT_NOT_FOUND',message:'Choose an active client from your current organisation or branch.'}},404);
  if(staffId){const member=await db.prepare(`SELECT id FROM staff WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND status='Active'`).bind(staffId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!member)return json({error:{code:'STAFF_NOT_FOUND',message:'Choose an active care worker from your current organisation or branch.'}},404);}
  if(staffId){const clash=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND staff_id=? AND rota_status!='cancelled' AND status!='cancelled' AND datetime(scheduled_start)<datetime(COALESCE(?,?,'9999-12-31')) AND datetime(COALESCE(scheduled_end,scheduled_start,'9999-12-31'))>datetime(?) LIMIT 1`).bind(session.organisation_id,staffId,end,start,start).first();if(clash)return json({error:{code:'ROTA_CLASH',message:'This staff member already has an overlapping visit.'}},409);}
  const id=crypto.randomUUID(),recurrence=clean(i.recurrence)||'none',group=recurrence==='none'?null:crypto.randomUUID();
  const occurrences=[];let cursor=new Date(start),finish=new Date(end),count=recurrence==='weekly'?Math.min(Number(i.occurrences)||4,52):1;
  for(let n=0;n<count;n++){const vid=n===0?id:crypto.randomUUID();occurrences.push(db.prepare(`INSERT INTO care_visits(id,organisation_id,branch_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(vid,session.organisation_id,client.branch_id||activeBranch(session),clientId,staffId,clean(i.visitType)||'Care visit',cursor.toISOString(),finish.toISOString(),'scheduled','rota','draft',group,recurrence,session.user_id));cursor=new Date(cursor.getTime()+7*86400000);finish=new Date(finish.getTime()+7*86400000);}
  occurrences.push(auditStatement(db,session.organisation_id,session.user_id,'rota.visit_created','visit',id,{clientId,staffId,recurrence,count,publicationStatus:'draft'}));
  await db.batch(occurrences);return json({ok:true,id,created:count});
}

async function publishRota(request,db,session){
  const i=await readJson(request),from=clean(i.from),to=clean(i.to);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid rota week before publishing.'}},400);
  const start=new Date(`${from}T06:00:00.000Z`),end=new Date(`${to}T06:00:00.000Z`);end.setUTCDate(end.getUTCDate()+1);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||end-start>32*86400000)return json({error:{code:'VALIDATION_ERROR',message:'The publication period must be between one and 31 service days.'}},400);
  const scoped=branchRestricted(session),branch=activeBranch(session);
  const rows=(await db.prepare(`SELECT id,staff_id,scheduled_start,scheduled_end,status,rota_status,travel_conflict,travel_override FROM care_visits WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND rota_status='draft' AND status!='cancelled' AND datetime(scheduled_start)>=datetime(?) AND datetime(scheduled_start)<datetime(?) ORDER BY scheduled_start`).bind(session.organisation_id,...(scoped?[branch]:[]),start.toISOString(),end.toISOString()).all()).results||[];
  const readiness=assessRotaPublication(rows);
  if(!readiness.draft)return json({error:{code:'NO_DRAFT_VISITS',message:'There are no draft visits to publish in this period.'}},409);
  if(!readiness.ready)return json({error:{code:'ROTA_NOT_READY',message:`The rota cannot be published: ${readiness.blockers.join('; ')}.`,details:readiness}},409);
  const result=await db.batch([
    db.prepare(`UPDATE care_visits SET rota_status='published',published_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND rota_status='draft' AND status!='cancelled' AND datetime(scheduled_start)>=datetime(?) AND datetime(scheduled_start)<datetime(?)`).bind(session.organisation_id,...(scoped?[branch]:[]),start.toISOString(),end.toISOString()),
    auditStatement(db,session.organisation_id,session.user_id,'rota.period_published','rota',`${from}:${to}`,{from,to,count:readiness.draft,branchId:scoped?branch:null})
  ]);
  return json({ok:true,published:Number(result[0]?.meta?.changes||readiness.draft),from,to});
}

async function manageVisitRecurrence(request,db,session,id){
  const visit=await db.prepare(`SELECT * FROM care_visits WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''}`).bind(id,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!visit)return notFound('Rota visit');
  const i=await readJson(request),action=clean(i.action)||'create';
  const existing=visit.template_id?await db.prepare(`SELECT * FROM rota_visit_templates WHERE id=? AND organisation_id=?`).bind(visit.template_id,session.organisation_id).first():null;
  const seriesId=existing?.series_id||clean(i.seriesId)||crypto.randomUUID();
  if(action==='pause'||action==='resume'){
    await db.batch([db.prepare(`UPDATE rota_visit_templates SET status=?,paused_at=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND series_id=?`).bind(action==='pause'?'paused':'active',action==='pause'?new Date().toISOString():null,session.organisation_id,seriesId),auditStatement(db,session.organisation_id,session.user_id,`rota.recurrence_${action}`,'rota_recurrence',seriesId,{visitId:id})]);return json({ok:true,action,seriesId});
  }
  if(action==='stop'){
    const stopDate=clean(i.effectiveTo)||new Date(visit.scheduled_start).toISOString().slice(0,10);
    const statements=[db.prepare(`UPDATE rota_visit_templates SET effective_to=?,status='ended',updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND series_id=?`).bind(stopDate,session.organisation_id,seriesId)];
    if(i.detachVisit!==false)statements.push(db.prepare(`UPDATE care_visits SET template_id=NULL,recurrence_group_id=NULL,recurrence_pattern='none',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id));
    statements.push(auditStatement(db,session.organisation_id,session.user_id,'rota.recurrence_stopped','rota_recurrence',seriesId,{visitId:id,stopDate,detached:i.detachVisit!==false}));await db.batch(statements);return json({ok:true,action,seriesId,detached:i.detachVisit!==false});
  }
  const start=new Date(visit.scheduled_start),duration=Math.max(15,Math.round(((visit.scheduled_end?new Date(visit.scheduled_end):new Date(start.getTime()+30*60000))-start)/60000));
  const days=Array.isArray(i.days)&&i.days.length?[...new Set(i.days.map(Number).filter(x=>x>=1&&x<=7))]:[((start.getDay()+6)%7)+1];
  const interval=Math.min(52,Math.max(1,Number(i.intervalWeeks)||1)),effectiveFrom=clean(i.effectiveFrom)||start.toISOString().slice(0,10),effectiveTo=clean(i.effectiveTo)||null,endAfter=Math.max(0,Number(i.endAfterOccurrences)||0);
  const keepCarer=i.keepCarer!==false,staffId=keepCarer?visit.staff_id:null,name=clean(i.name)||`${visit.visit_type||'Care visit'} recurring visit`;
  const statements=[];
  if(action==='update'&&seriesId)statements.push(db.prepare(`DELETE FROM rota_visit_templates WHERE organisation_id=? AND series_id=?`).bind(session.organisation_id,seriesId));
  let firstTemplateId=null;
  for(const day of days){const tid=crypto.randomUUID();if(!firstTemplateId)firstTemplateId=tid;statements.push(db.prepare(`INSERT INTO rota_visit_templates(id,organisation_id,client_id,name,visit_type,day_of_week,preferred_time,duration_minutes,carers_required,preferred_staff_id,backup_staff_id,window_minutes,effective_from,effective_to,status,notes,created_by,series_id,interval_weeks,end_after_occurrences,paused_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(tid,session.organisation_id,visit.client_id,name,visit.visit_type||'Care visit',day,start.toISOString().slice(11,16),duration,1,staffId,null,15,effectiveFrom,effectiveTo,'active',clean(i.notes)||visit.planner_notes||'',session.user_id,seriesId,interval,endAfter,null));}
  statements.push(db.prepare(`UPDATE care_visits SET template_id=?,recurrence_group_id=?,recurrence_pattern=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(firstTemplateId,seriesId,interval===1?'weekly':`every_${interval}_weeks`,id,session.organisation_id));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,action==='update'?'rota.recurrence_updated':'rota.recurrence_created','rota_recurrence',seriesId,{visitId:id,days,interval,effectiveFrom,effectiveTo,endAfter,staffId}));
  await db.batch(statements);return json({ok:true,action,seriesId,templateId:firstTemplateId,templatesCreated:days.length});
}

async function authoriseProtectedVisitChange(db,session,visit,input,newStart){
  const email=clean(input.managerEmail).toLowerCase(),password=String(input.managerPassword||''),reason=clean(input.managerOverrideReason);
  if(!email||!password||reason.length<5)return {error:json({error:{code:'TIME_CRITICAL_AUTH_REQUIRED',message:'Manager authorisation, password and a clear reason are required to change this protected visit.'}},409)};
  const manager=await db.prepare(`SELECT id,email,role,access_level,status,password_hash,password_salt,password_iterations FROM users WHERE organisation_id=? AND lower(email)=lower(?) LIMIT 1`).bind(session.organisation_id,email).first();
  const valid=manager&&manager.status==='active'&&await verifyPassword(password,manager.password_salt,manager.password_hash,manager.password_iterations||PASSWORD_ITERATIONS);
  if(!valid)return {error:json({error:{code:'MANAGER_AUTH_FAILED',message:'The manager email address or password is incorrect.'}},401)};
  const managerSession={...session,user_id:manager.id,role:manager.role,access_level:manager.access_level,is_platform_user:false,_permissionFacts:null};
  const allowed=await userHasPermission(db,managerSession,'rota.time_critical.override');
  if(!allowed)return {error:json({error:{code:'MANAGER_AUTH_FORBIDDEN',message:'This account is not authorised to override protected visit times.'}},403)};
  return {manager,reason,statement:db.prepare(`INSERT INTO protected_visit_authorisations(id,organisation_id,visit_id,requested_by,authorised_by,previous_start,new_start,reason) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visit.id,session.user_id,manager.id,visit.scheduled_start,newStart,reason)};
}

async function updateRotaVisit(request,env,session,id){
  const db=env.DB;
  const i=await readJson(request),row=await db.prepare(`SELECT * FROM care_visits WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''}`).bind(id,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!row)return notFound('Rota visit');
  if(['in_progress','completed'].includes(row.status))return json({error:{code:'VISIT_STARTED',message:'A started or completed visit cannot be rescheduled from the rota.'}},409);
  const requestedLocked=i.plannerLocked===true||i.plannerLocked===1||i.plannerLocked==='1';
  if(Number(row.planner_locked)===1){const allowed=await userHasPermission(db,session,'rota.visit.override_lock');if(!allowed)return json({error:{code:'VISIT_LOCKED',message:'This visit is locked. An authorised planner or manager must unlock or change it.'}},409);}
  const staffId=clean(i.staffId)||null,start=clean(i.scheduledStart)||row.scheduled_start,end=clean(i.scheduledEnd)||row.scheduled_end,scope=['single','future','series'].includes(clean(i.scope))?clean(i.scope):'single',reason=clean(i.reason)||'Planner adjustment',plannerNotes=clean(i.plannerNotes)||row.planner_notes||'';
  const protectedRule=clean(row.protected_time_rule)||'flexible',timeChanged=new Date(start).getTime()!==new Date(row.scheduled_start).getTime();
  let protectedAuth=null;
  if(timeChanged&&protectedRule!=='flexible'){
    if(protectedRule==='window'){const delta=Math.abs(new Date(start)-new Date(row.scheduled_start))/60000;if(delta<=Number(row.protected_window_minutes||0)){/* permitted within window */}else{protectedAuth=await authoriseProtectedVisitChange(db,session,row,i,start);if(protectedAuth.error)return protectedAuth.error;}}
    else {protectedAuth=await authoriseProtectedVisitChange(db,session,row,i,start);if(protectedAuth.error)return protectedAuth.error;}
  }
  if(staffId){const clash=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND staff_id=? AND id!=? AND rota_status!='cancelled' AND datetime(scheduled_start)<datetime(COALESCE(?,?,'9999-12-31')) AND datetime(COALESCE(scheduled_end,scheduled_start,'9999-12-31'))>datetime(?) LIMIT 1`).bind(session.organisation_id,staffId,id,end,start,start).first();if(clash)return json({error:{code:'ROTA_CLASH',message:'This staff member already has an overlapping visit.'}},409);}
  let travelAssessment=null;
  const overrideReason=clean(i.travelOverrideReason);
  if(staffId){
    travelAssessment=await assessTravelPlacement(env,session,{id,client_id:clean(i.clientId)||row.client_id,staff_id:staffId,scheduled_start:start,scheduled_end:end});
    if(travelAssessment.conflict){
      const permitted=overrideReason && await userHasPermission(db,session,'rota.travel.override');
      if(!permitted)return json({error:{code:'TRAVEL_CONFLICT',message:`Travel time requires ${travelAssessment.required} minutes but only ${travelAssessment.available} minutes is available. A permitted planner or manager must enter an override reason.`},travel:travelAssessment},409);
    }
  }
  const before=JSON.stringify({staffId:row.staff_id,start:row.scheduled_start,end:row.scheduled_end,visitType:row.visit_type,plannerLocked:Number(row.planner_locked)||0,plannerNotes:row.planner_notes||''});
  const after=JSON.stringify({staffId,start,end,visitType:clean(i.visitType)||row.visit_type,plannerLocked:requestedLocked?1:0,plannerNotes});
  const statements=[];
  if(protectedAuth?.statement)statements.push(protectedAuth.statement);
  if(scope==='single'||!row.requirement_id){statements.push(db.prepare(`UPDATE care_visits SET client_id=?,staff_id=?,visit_type=?,scheduled_start=?,scheduled_end=?,rota_source='planner',rota_status='draft',change_reason=?,manually_overridden=1,travel_override=?,travel_override_reason=?,planner_locked=?,planner_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.clientId)||row.client_id,staffId,clean(i.visitType)||row.visit_type,start,end,reason,travelAssessment?.conflict?1:0,overrideReason,requestedLocked?1:0,plannerNotes,id,session.organisation_id));}
  else {
    const time=new Date(start).toISOString().slice(11,16),duration=Math.max(15,Math.round((new Date(end)-new Date(start))/60000));
    statements.push(db.prepare(`UPDATE client_visit_requirements SET visit_type=?,preferred_time=?,duration_minutes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.visitType)||row.visit_type,time,duration,row.requirement_id,session.organisation_id));
    const condition=scope==='future'?'AND date(scheduled_start)>=date(?)':'';
    const bind=[staffId,clean(i.visitType)||row.visit_type,reason,requestedLocked?1:0,plannerNotes,row.requirement_id,session.organisation_id];if(scope==='future')bind.push(row.scheduled_start);
    statements.push(db.prepare(`UPDATE care_visits SET staff_id=?,visit_type=?,rota_source='planner',rota_status='draft',change_reason=?,manually_overridden=1,planner_locked=?,planner_notes=?,updated_at=CURRENT_TIMESTAMP WHERE requirement_id=? AND organisation_id=? AND status='scheduled' ${condition}`).bind(...bind));
  }
  statements.push(db.prepare(`INSERT INTO visit_change_history(id,organisation_id,visit_id,requirement_id,change_scope,reason,before_json,after_json,changed_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,id,row.requirement_id,scope,reason,before,after,session.user_id));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'rota.visit_updated','visit',id,{staffId,start,end,scope,reason,protectedOverride:Boolean(protectedAuth),authorisedBy:protectedAuth?.manager?.id||null}));
  if(travelAssessment?.conflict){statements.push(db.prepare(`INSERT INTO travel_override_history(id,organisation_id,visit_id,calculated_minutes,available_minutes,shortfall_minutes,reason,overridden_by) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,id,travelAssessment.required,travelAssessment.available,travelAssessment.shortfall,overrideReason,session.user_id));}
  await db.batch(statements);
  const affectedDays=new Set([String(start).slice(0,10),String(row.scheduled_start).slice(0,10)]);
  for(const day of affectedDays){if(staffId)await recalculateStaffTravel(env,session,staffId,day);if(row.staff_id&&row.staff_id!==staffId)await recalculateStaffTravel(env,session,row.staff_id,day);}
  return json({ok:true,scope,travel:travelAssessment});
}
async function cancelRotaVisit(request,db,session,id){const i=await readJson(request);const row=await db.prepare(`SELECT status FROM care_visits WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''}`).bind(id,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!row)return notFound('Rota visit');if(row.status==='completed')return json({error:{code:'VISIT_COMPLETED',message:'A completed visit cannot be cancelled.'}},409);await db.batch([db.prepare(`UPDATE care_visits SET status='cancelled',rota_status='cancelled',cancelled_at=CURRENT_TIMESTAMP,cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.reason)||'Cancelled from rota',id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'rota.visit_cancelled','visit',id,{reason:i.reason})]);return json({ok:true});}


async function routingSettings(db,organisationId){
  await db.prepare(`INSERT OR IGNORE INTO organisation_routing_settings(organisation_id) VALUES(?)`).bind(organisationId).run();
  return db.prepare(`SELECT * FROM organisation_routing_settings WHERE organisation_id=?`).bind(organisationId).first();
}
async function getRoutingSettings(env,session){
  if(!await userHasPermission(env.DB,session,'rota.travel.settings')&&!canManageSecurity(session))return forbidden();
  const settings=await routingSettings(env.DB,session.organisation_id);
  return json({settings,mapboxConfigured:Boolean(env.MAPBOX_ACCESS_TOKEN)});
}
async function updateRoutingSettings(request,env,session){
  if(!await userHasPermission(env.DB,session,'rota.travel.settings')&&!canManageSecurity(session))return forbidden();
  const i=await readJson(request),provider=['manual','mapbox'].includes(clean(i.provider))?clean(i.provider):'manual';
  const fallback=Math.max(0,Math.min(180,Number(i.defaultTravelMinutes)||15)),buffer=Math.max(0,Math.min(60,Number(i.parkingBufferMinutes)||5)),cacheDays=Math.max(1,Math.min(365,Number(i.cacheDays)||90));
  if(provider==='mapbox'&&!env.MAPBOX_ACCESS_TOKEN)return json({error:{code:'MAPBOX_NOT_CONFIGURED',message:'Add the MAPBOX_ACCESS_TOKEN Cloudflare secret before enabling Mapbox routing.'}},400);
  await env.DB.batch([env.DB.prepare(`INSERT INTO organisation_routing_settings(organisation_id,provider,default_travel_minutes,parking_buffer_minutes,cache_days,block_conflicts,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(organisation_id) DO UPDATE SET provider=excluded.provider,default_travel_minutes=excluded.default_travel_minutes,parking_buffer_minutes=excluded.parking_buffer_minutes,cache_days=excluded.cache_days,block_conflicts=excluded.block_conflicts,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,provider,fallback,buffer,cacheDays,i.blockConflicts===false?0:1,session.user_id),auditStatement(env.DB,session.organisation_id,session.user_id,'routing.settings_updated','organisation',session.organisation_id,{provider,fallback,buffer,cacheDays})]);
  return getRoutingSettings(env,session);
}
function fullClientAddress(row){return [row.address_line_1,row.address_line_2,row.town,row.postcode,'United Kingdom'].map(clean).filter(Boolean).join(', ');}
async function clientRouteLocation(env,session,clientId){
  const c=await env.DB.prepare(`SELECT id,address_line_1,address_line_2,town,postcode FROM clients WHERE id=? AND organisation_id=?`).bind(clientId,session.organisation_id).first();
  if(!c)return null;const address=fullClientAddress(c);if(!address)return null;const hash=await sha256Base64(address.toLowerCase());
  let cached=await env.DB.prepare(`SELECT * FROM routing_location_cache WHERE organisation_id=? AND entity_type='client' AND entity_id=? AND address_hash=? ORDER BY geocoded_at DESC LIMIT 1`).bind(session.organisation_id,clientId,hash).first();
  if(cached?.longitude!=null&&cached?.latitude!=null)return {hash,address,longitude:Number(cached.longitude),latitude:Number(cached.latitude)};
  if(!env.MAPBOX_ACCESS_TOKEN)return {hash,address};
  const url=`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?country=gb&limit=1&access_token=${encodeURIComponent(env.MAPBOX_ACCESS_TOKEN)}`;
  const response=await fetch(url);if(!response.ok)return {hash,address};const data=await response.json(),centre=data.features?.[0]?.center;if(!centre)return {hash,address};
  await env.DB.prepare(`INSERT OR REPLACE INTO routing_location_cache(id,organisation_id,entity_type,entity_id,address_hash,formatted_address,longitude,latitude,provider,geocoded_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),session.organisation_id,'client',clientId,hash,address,centre[0],centre[1],'mapbox').run();
  return {hash,address,longitude:centre[0],latitude:centre[1]};
}
async function routeBetweenClients(env,session,originClientId,destinationClientId){
  const settings=await routingSettings(env.DB,session.organisation_id);const fallback={minutes:Number(settings.default_travel_minutes)||15,miles:0,source:'manual'};
  if(!originClientId||!destinationClientId||originClientId===destinationClientId)return {...fallback,minutes:Math.max(0,Number(settings.parking_buffer_minutes)||0)};
  if(settings.provider!=='mapbox'||!env.MAPBOX_ACCESS_TOKEN)return {...fallback,minutes:fallback.minutes+(Number(settings.parking_buffer_minutes)||0)};
  const [a,b]=await Promise.all([clientRouteLocation(env,session,originClientId),clientRouteLocation(env,session,destinationClientId)]);if(a?.longitude==null||b?.longitude==null)return {...fallback,minutes:fallback.minutes+(Number(settings.parking_buffer_minutes)||0)};
  const cached=await env.DB.prepare(`SELECT * FROM routing_route_cache WHERE organisation_id=? AND origin_hash=? AND destination_hash=? AND provider='mapbox' AND datetime(expires_at)>CURRENT_TIMESTAMP`).bind(session.organisation_id,a.hash,b.hash).first();
  if(cached)return {minutes:Math.ceil(Number(cached.duration_seconds)/60)+(Number(settings.parking_buffer_minutes)||0),miles:Number(cached.distance_metres)/1609.344,source:'mapbox-cache'};
  const url=`https://api.mapbox.com/directions/v5/mapbox/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=false&steps=false&access_token=${encodeURIComponent(env.MAPBOX_ACCESS_TOKEN)}`;
  const response=await fetch(url);if(!response.ok)return {...fallback,minutes:fallback.minutes+(Number(settings.parking_buffer_minutes)||0)};const data=await response.json(),route=data.routes?.[0];if(!route)return {...fallback,minutes:fallback.minutes+(Number(settings.parking_buffer_minutes)||0)};
  const expires=new Date(Date.now()+(Number(settings.cache_days)||90)*86400000).toISOString();
  await env.DB.prepare(`INSERT INTO routing_route_cache(id,organisation_id,origin_hash,destination_hash,provider,distance_metres,duration_seconds,expires_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id,origin_hash,destination_hash,provider) DO UPDATE SET distance_metres=excluded.distance_metres,duration_seconds=excluded.duration_seconds,calculated_at=CURRENT_TIMESTAMP,expires_at=excluded.expires_at`).bind(crypto.randomUUID(),session.organisation_id,a.hash,b.hash,'mapbox',Math.round(route.distance),Math.round(route.duration),expires).run();
  return {minutes:Math.ceil(route.duration/60)+(Number(settings.parking_buffer_minutes)||0),miles:route.distance/1609.344,source:'mapbox'};
}
async function assessTravelPlacement(env,session,proposed){
  const day=String(proposed.scheduled_start).slice(0,10),rows=await env.DB.prepare(`SELECT id,client_id,scheduled_start,scheduled_end FROM care_visits WHERE organisation_id=? AND staff_id=? AND id!=? AND date(scheduled_start)=date(?) AND rota_status!='cancelled' AND status!='cancelled' ORDER BY scheduled_start`).bind(session.organisation_id,proposed.staff_id,proposed.id||'',day).all();
  const start=new Date(proposed.scheduled_start),end=new Date(proposed.scheduled_end||proposed.scheduled_start);let previous=null,next=null;for(const r of rows.results||[]){if(new Date(r.scheduled_end||r.scheduled_start)<=start)previous=r;else if(new Date(r.scheduled_start)>=end){next=r;break;}}
  const checks=[];if(previous){const route=await routeBetweenClients(env,session,previous.client_id,proposed.client_id),available=Math.floor((start-new Date(previous.scheduled_end||previous.scheduled_start))/60000);checks.push({side:'before',required:route.minutes,available,route});}
  if(next){const route=await routeBetweenClients(env,session,proposed.client_id,next.client_id),available=Math.floor((new Date(next.scheduled_start)-end)/60000);checks.push({side:'after',required:route.minutes,available,route});}
  const failed=checks.filter(x=>x.available<x.required),worst=failed.sort((a,b)=>(b.required-b.available)-(a.required-a.available))[0];return {conflict:Boolean(worst),required:worst?.required||0,available:worst?.available||0,shortfall:worst?worst.required-worst.available:0,checks};
}
async function recalculateStaffTravel(env,session,staffId,day){
  if(!staffId||!day)return;const result=await env.DB.prepare(`SELECT id,client_id,scheduled_start,scheduled_end FROM care_visits WHERE organisation_id=? AND staff_id=? AND date(scheduled_start)=date(?) AND rota_status!='cancelled' AND status!='cancelled' ORDER BY scheduled_start`).bind(session.organisation_id,staffId,day).all(),visits=result.results||[];const statements=[];
  for(let index=0;index<visits.length;index++){const visit=visits[index],prev=visits[index-1],next=visits[index+1];const before=prev?await routeBetweenClients(env,session,prev.client_id,visit.client_id):{minutes:0,miles:0,source:'start'},after=next?await routeBetweenClients(env,session,visit.client_id,next.client_id):{minutes:0,miles:0,source:'finish'};const available=prev?Math.floor((new Date(visit.scheduled_start)-new Date(prev.scheduled_end||prev.scheduled_start))/60000):9999,conflict=prev&&available<before.minutes?1:0;statements.push(env.DB.prepare(`UPDATE care_visits SET travel_before_minutes=?,travel_after_minutes=?,travel_before_miles=?,travel_after_miles=?,travel_source=?,travel_calculated_at=CURRENT_TIMESTAMP,travel_conflict=?,travel_conflict_minutes=? WHERE id=? AND organisation_id=?`).bind(before.minutes,after.minutes,Number(before.miles||0).toFixed(2),Number(after.miles||0).toFixed(2),before.source,conflict,conflict?before.minutes-available:0,visit.id,session.organisation_id));}
  if(statements.length)await env.DB.batch(statements);
}
async function recalculateRouting(request,env,session){
  if(!await userHasPermission(env.DB,session,'rota.edit')&&!canManageSecurity(session))return forbidden();const i=await readJson(request),staffId=clean(i.staffId),day=clean(i.day);if(!staffId||!day)return json({error:{code:'VALIDATION_ERROR',message:'Choose a care worker and day.'}},400);await recalculateStaffTravel(env,session,staffId,day);return json({ok:true});
}

async function visitsBoard(db, session) {
  const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session);
  const [visits,clients,staff,codes]=await Promise.all([
    db.prepare(`SELECT v.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id WHERE v.organisation_id=? ${scoped?'AND v.branch_id=?':''} AND COALESCE(v.rota_status,'published')='published' AND date(v.scheduled_start)=date('now') ORDER BY v.scheduled_start`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active' ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT vc.client_id,vc.code,vc.expires_at FROM client_visit_codes vc JOIN clients c ON c.id=vc.client_id AND c.organisation_id=vc.organisation_id WHERE vc.organisation_id=? ${scoped?'AND c.branch_id=?':''} AND vc.active=1 AND datetime(COALESCE(vc.expires_at,'1970-01-01'))>CURRENT_TIMESTAMP`).bind(org,...(scoped?[branch]:[])).all()
  ]);
  const rows=visits.results||[], now=Date.now();
  rows.forEach(v=>{if(v.status==='scheduled'&&new Date(v.scheduled_start).getTime()+15*60000<now)v.live_status='late';else if(v.status==='in_progress'&&v.scheduled_end&&new Date(v.scheduled_end).getTime()<now)v.live_status='overrunning';else v.live_status=v.status;});
  const stats={scheduled:rows.filter(x=>x.status==='scheduled').length,inProgress:rows.filter(x=>x.status==='in_progress').length,late:rows.filter(x=>x.live_status==='late').length,completed:rows.filter(x=>x.status==='completed').length,overrunning:rows.filter(x=>x.live_status==='overrunning').length};
  return json({visits:rows,clients:clients.results||[],staff:staff.results||[],codes:codes.results||[],stats});
}
async function createVisit(request,db,session){
  const i=await readJson(request),clientId=clean(i.clientId),staffId=clean(i.staffId)||null,start=clean(i.scheduledStart),end=clean(i.scheduledEnd)||null;
  if(!clientId||!start)return json({error:{code:'VALIDATION_ERROR',message:'Select a client and scheduled start.'}},400);
  if(Number.isNaN(new Date(start).getTime())||(end&&new Date(end)<=new Date(start)))return json({error:{code:'VALIDATION_ERROR',message:'Enter a valid visit start and end time.'}},400);
  const client=await ensureClient(db,session,clientId);if(!client)return notFound('Client');
  if(staffId){const staff=await db.prepare(`SELECT id,branch_id FROM staff WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND status='Active'`).bind(staffId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!staff)return notFound('Staff member');if(client.branch_id&&staff.branch_id&&client.branch_id!==staff.branch_id)return json({error:{code:'BRANCH_MISMATCH',message:'The client and assigned staff member must belong to the same branch.'}},409);}
  const id=crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO care_visits(id,organisation_id,branch_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,rota_source,rota_status,published_at,created_by) VALUES(?,?,?,?,?,?,?,?,'manual','published',CURRENT_TIMESTAMP,?)`).bind(id,session.organisation_id,client.branch_id||null,clientId,staffId,clean(i.visitType)||'Care visit',start,end,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'visits.created','visit',id,{clientId,staffId})]);return json({ok:true,id});
}
async function getVisitCareRecord(db,session,visitId){
  const visit=await db.prepare(`SELECT v.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id WHERE v.id=? AND v.organisation_id=?`).bind(visitId,session.organisation_id).first();
  if(!visit)return notFound('Visit');
  if(['carer','senior_carer'].includes(session.access_level)&&(!session.staff_id||visit.staff_id!==session.staff_id))return forbidden('This visit is allocated to another care worker.');
  const [record,tasks]=await Promise.all([
    db.prepare(`SELECT * FROM visit_care_records WHERE organisation_id=? AND visit_id=?`).bind(session.organisation_id,visitId).first(),
    db.prepare(`SELECT * FROM visit_task_records WHERE organisation_id=? AND visit_id=? ORDER BY recorded_at`).bind(session.organisation_id,visitId).all()
  ]);
  return json({visit,record:record||null,tasks:tasks.results||[],medication:[],medicationRecording:'emar'});
}
async function saveVisitCareRecord(request,db,session,visitId){
  const i=await readJson(request),visit=await db.prepare(`SELECT * FROM care_visits WHERE id=? AND organisation_id=?`).bind(visitId,session.organisation_id).first();
  if(!visit)return notFound('Visit');
  if(['carer','senior_carer'].includes(session.access_level)&&(!session.staff_id||visit.staff_id!==session.staff_id))return forbidden('This visit is allocated to another care worker.');
  if(!['in_progress','completed'].includes(visit.status))return json({error:{code:'VISIT_NOT_STARTED',message:'Clock into the visit before recording care delivery.'}},409);
  const notes=clean(i.careNotes);if(!notes)return json({error:{code:'VALIDATION_ERROR',message:'Enter the care notes before completing the visit.'}},400);
  if(i.incidentRequired&&!await userHasPermission(db,session,'incidents.create'))return forbidden('You do not have permission to create an incident from this care record.');
  const recordId=crypto.randomUUID(),tasks=Array.isArray(i.tasks)?i.tasks:[],meds=Array.isArray(i.medication)?i.medication:[],statements=[];
  if(meds.some(m=>clean(m?.outcome)&&clean(m.outcome)!=='not_required'))return json({error:{code:'EMAR_REQUIRED',message:'Medication administrations must be recorded in eMAR so that stock, witness and audit controls are applied.'}},409);
  statements.push(db.prepare(`INSERT INTO visit_care_records(id,organisation_id,visit_id,client_id,staff_id,mood,wellbeing,care_notes,fluid_intake_ml,nutrition,toileting,mobility_support,skin_observation,body_map_notes,follow_up_required,follow_up_notes,completed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id,visit_id) DO UPDATE SET mood=excluded.mood,wellbeing=excluded.wellbeing,care_notes=excluded.care_notes,fluid_intake_ml=excluded.fluid_intake_ml,nutrition=excluded.nutrition,toileting=excluded.toileting,mobility_support=excluded.mobility_support,skin_observation=excluded.skin_observation,body_map_notes=excluded.body_map_notes,follow_up_required=excluded.follow_up_required,follow_up_notes=excluded.follow_up_notes,completed_by=excluded.completed_by,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(recordId,session.organisation_id,visitId,visit.client_id,visit.staff_id||session.staff_id||null,clean(i.mood)||'not_recorded',clean(i.wellbeing)||'no_change',notes,Math.max(0,Number(i.fluidIntakeMl)||0),clean(i.nutrition)||'not_recorded',clean(i.toileting)||'not_recorded',clean(i.mobilitySupport),clean(i.skinObservation),clean(i.bodyMapNotes),i.followUpRequired?1:0,clean(i.followUpNotes),session.user_id));
  statements.push(db.prepare(`DELETE FROM visit_task_records WHERE organisation_id=? AND visit_id=?`).bind(session.organisation_id,visitId));
  for(const task of tasks){if(!clean(task.key)||!clean(task.label))continue;statements.push(db.prepare(`INSERT INTO visit_task_records(id,organisation_id,visit_id,task_key,task_label,status,notes,recorded_by) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visitId,clean(task.key),clean(task.label),clean(task.status)||'completed',clean(task.notes),session.user_id));}
  const complete=i.completeVisit!==false;
  if(complete)statements.push(db.prepare(`UPDATE care_visits SET status='completed',actual_end=COALESCE(actual_end,CURRENT_TIMESTAMP),notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(notes,visitId,session.organisation_id));
  if(i.followUpRequired)statements.push(db.prepare(`INSERT INTO operations_tasks(id,organisation_id,branch_id,client_id,title,description,priority,status,due_at,created_by) VALUES(?,?,?,?,?,?,'high','open',datetime('now','+1 day'),?)`).bind(crypto.randomUUID(),session.organisation_id,visit.branch_id||null,visit.client_id,'Care visit follow-up',clean(i.followUpNotes)||'Review follow-up raised from the care visit.',session.user_id));
  if(i.incidentRequired&&clean(i.incidentTitle)){const incidentId=crypto.randomUUID(),incidentSeverity=clean(i.incidentSeverity)||'medium';statements.push(db.prepare(`INSERT INTO operations_incidents(id,organisation_id,reference_number,branch_id,client_id,title,description,severity,status,reported_by,immediate_action,duty_of_candour_required) VALUES(?,?,?,?,?,?,?,?,'open',?,?,?)`).bind(incidentId,session.organisation_id,incidentReference(incidentId),visit.branch_id||null,visit.client_id,clean(i.incidentTitle),clean(i.incidentDetails),incidentSeverity,session.user_id,clean(i.followUpNotes),['high','critical'].includes(incidentSeverity)?1:0));}
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'care_delivery.visit_recorded','visit',visitId,{tasks:tasks.length,medicationRecordedInEmar:true,followUp:Boolean(i.followUpRequired),incident:Boolean(i.incidentRequired),completed:complete}));
  await db.batch(statements);return json({ok:true,visitId,status:complete?'completed':visit.status});
}
async function ensureClientVisitCode(request,db,session){
  const i=await readJson(request),clientId=clean(i.clientId),regenerate=Boolean(i.regenerate);if(!clientId)return json({error:{code:'VALIDATION_ERROR',message:'Select a client.'}},400);
  const client=await ensureClient(db,session,clientId);if(!client)return notFound('Client');
  let row=await db.prepare("SELECT code,created_at,expires_at FROM client_visit_codes WHERE organisation_id=? AND client_id=? AND active=1 AND datetime(COALESCE(expires_at,'1970-01-01'))>CURRENT_TIMESTAMP ORDER BY created_at DESC").bind(session.organisation_id,clientId).first();
  if(regenerate||!row){
    const code='CC-'+crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase(),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+90*86400000).toISOString();
    await db.batch([db.prepare('UPDATE client_visit_codes SET active=0,revoked_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND client_id=? AND active=1').bind(session.organisation_id,clientId),db.prepare('INSERT INTO client_visit_codes(id,organisation_id,client_id,code,active,created_by,expires_at) VALUES(?,?,?,?,1,?,?)').bind(crypto.randomUUID(),session.organisation_id,clientId,code,session.user_id,expiresAt),auditStatement(db,session.organisation_id,session.user_id,regenerate?'client.verification_code_regenerated':'client.verification_code_issued','client',clientId,{expiresAt})]);
    row={code,created_at:createdAt,expires_at:expiresAt};
  }
  return json({ok:true,code:row.code,createdAt:row.created_at,expiresAt:row.expires_at,clientName:`${client.first_name} ${client.last_name}`});
}

async function syncVisitEvents(request,db,session){const i=await readJson(request),events=Array.isArray(i.events)?i.events:[];const results=[];for(const event of events){const eventId=clean(event.eventId),code=clean(event.code),type=clean(event.type),deviceTime=clean(event.deviceTime),source=clean(event.source)||'online',deviceTimestamp=new Date(deviceTime).getTime();if(!eventId||!code||!['clock_in','clock_out'].includes(type)||!deviceTime||!Number.isFinite(deviceTimestamp)){results.push({eventId,ok:false,error:'Invalid event'});continue;}const allowedDrift=source==='offline'?72*3600000:15*60000;if(Math.abs(Date.now()-deviceTimestamp)>allowedDrift){results.push({eventId,ok:false,error:source==='offline'?'Offline events must be synchronised within 72 hours.':'The device time differs from CoreCare by more than 15 minutes.'});continue;}const existing=await db.prepare('SELECT id FROM visit_events WHERE device_event_id=? AND organisation_id=?').bind(eventId,session.organisation_id).first();if(existing){results.push({eventId,ok:true,duplicate:true});continue;}const clientCode=await db.prepare(`SELECT vc.id,vc.client_id FROM client_visit_codes vc JOIN clients c ON c.id=vc.client_id AND c.organisation_id=vc.organisation_id WHERE vc.organisation_id=? AND vc.code=? AND vc.active=1 AND datetime(COALESCE(vc.expires_at,'1970-01-01'))>CURRENT_TIMESTAMP ${branchRestricted(session)?'AND c.branch_id=?':''}`).bind(session.organisation_id,code,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!clientCode){results.push({eventId,ok:false,error:'Invalid, expired or inaccessible client code'});continue;}const isCarer=['carer','senior_carer'].includes(session.access_level);if(isCarer&&!session.staff_id){results.push({eventId,ok:false,error:'Your login is not linked to a staff record. Ask a manager to update your staff profile.'});continue;}const staffFilter=session.staff_id?`AND staff_id=?`:'';
const visitSql=`SELECT id,status,staff_id,scheduled_start FROM care_visits WHERE organisation_id=? AND client_id=? ${staffFilter} AND date(scheduled_start)=date(?) AND status IN ('scheduled','in_progress') ORDER BY CASE WHEN status='in_progress' THEN 0 ELSE 1 END, CASE WHEN staff_id IS NOT NULL THEN 0 ELSE 1 END, ABS(strftime('%s',scheduled_start)-strftime('%s',?)) LIMIT 1`;
let visit=session.staff_id
  ?await db.prepare(visitSql).bind(session.organisation_id,clientCode.client_id,session.staff_id,deviceTime,deviceTime).first()
  :await db.prepare(visitSql).bind(session.organisation_id,clientCode.client_id,deviceTime,deviceTime).first();if(!visit){results.push({eventId,ok:false,error:'No matching visit found'});continue;}if(Math.abs(deviceTimestamp-new Date(visit.scheduled_start).getTime())>12*3600000){results.push({eventId,ok:false,error:'The event time is too far from the scheduled visit. Ask a manager to review the exception.'});continue;}if(type==='clock_in'&&visit.status!=='scheduled'){results.push({eventId,ok:true,duplicate:true});continue;}if(type==='clock_out'&&visit.status!=='in_progress'){results.push({eventId,ok:false,error:'Visit is not clocked in'});continue;}const update=type==='clock_in'?db.prepare(`UPDATE care_visits SET status='in_progress',actual_start=?,clock_in_method='qr',clock_in_device_time=?,clock_in_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(deviceTime,deviceTime,visit.id,session.organisation_id):db.prepare(`UPDATE care_visits SET status='completed',actual_end=?,clock_out_method='qr',clock_out_device_time=?,clock_out_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(deviceTime,deviceTime,visit.id,session.organisation_id);await db.batch([update,db.prepare('UPDATE client_visit_codes SET last_used_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(clientCode.id,session.organisation_id),db.prepare(`INSERT INTO visit_events(id,organisation_id,visit_id,event_type,device_event_id,device_time,source,payload_json,created_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visit.id,type,eventId,deviceTime,source,JSON.stringify(event),session.user_id),auditStatement(db,session.organisation_id,session.user_id,`visits.${type}`,'visit',visit.id,{deviceTime,source})]);results.push({eventId,ok:true,visitId:visit.id});}return json({ok:true,results,receivedAt:new Date().toISOString()});}

async function operationsBoard(db, session) {
  const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session);
  const [canViewOperations,canViewTasks,canViewIncidents]=await Promise.all([
    userHasPermission(db,session,'operations.view'),
    userHasPermission(db,session,'tasks.view'),
    userHasPermission(db,session,'incidents.view')
  ]);
  if(!canViewOperations&&!canViewTasks&&!canViewIncidents)return forbidden();
  const [tasks,incidents,handovers,clients,staff,careDue,riskDue,incidentUpdates]=await Promise.all([
    db.prepare(`SELECT t.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name FROM operations_tasks t LEFT JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id LEFT JOIN staff s ON s.id=t.assigned_staff_id AND s.organisation_id=t.organisation_id WHERE t.organisation_id=? ${scoped?'AND t.branch_id=?':''} ORDER BY CASE t.status WHEN 'escalated' THEN 1 WHEN 'overdue' THEN 2 WHEN 'open' THEN 3 ELSE 4 END,COALESCE(t.due_at,t.created_at) LIMIT 100`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT i.*,COALESCE(i.reference_number,'INC-'||strftime('%Y',i.created_at)||'-'||upper(substr(replace(i.id,'-',''),1,8))) reference_number,c.first_name||' '||c.last_name client_name,u.display_name reviewed_by_name FROM operations_incidents i LEFT JOIN clients c ON c.id=i.client_id AND c.organisation_id=i.organisation_id LEFT JOIN users u ON u.id=i.reviewed_by AND u.organisation_id=i.organisation_id WHERE i.organisation_id=? ${scoped?'AND i.branch_id=?':''} ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,COALESCE(i.occurred_at,i.created_at) DESC LIMIT 100`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT h.*,u.display_name created_by_name FROM shift_handovers h LEFT JOIN users u ON u.id=h.created_by AND u.organisation_id=h.organisation_id WHERE h.organisation_id=? ${scoped?'AND h.branch_id=?':''} ORDER BY h.created_at DESC LIMIT 20`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active' ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT COUNT(*) count FROM care_plans WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active' AND date(review_date)<=date('now','+30 day')`).bind(org,...(scoped?[branch]:[])).first(),
    db.prepare(`SELECT COUNT(*) count FROM risk_assessments WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active' AND date(review_date)<=date('now','+30 day')`).bind(org,...(scoped?[branch]:[])).first(),
    canViewIncidents||canViewOperations?db.prepare(`SELECT x.*,u.display_name created_by_name FROM incident_updates x JOIN operations_incidents i ON i.id=x.incident_id AND i.organisation_id=x.organisation_id LEFT JOIN users u ON u.id=x.created_by AND u.organisation_id=x.organisation_id WHERE x.organisation_id=? ${scoped?'AND i.branch_id=?':''} ORDER BY datetime(x.created_at) DESC LIMIT 300`).bind(org,...(scoped?[branch]:[])).all():Promise.resolve({results:[]})
  ]);
  const taskRows=(canViewOperations||canViewTasks)?tasks.results||[]:[], incidentRows=(canViewOperations||canViewIncidents)?incidents.results||[]:[], handoverRows=canViewOperations?handovers.results||[]:[];
  const now=Date.now(); taskRows.forEach(t=>{if(t.status==='open'&&t.due_at&&new Date(t.due_at).getTime()<now)t.status='overdue'});
  const stats={open:taskRows.filter(x=>x.status==='open').length,overdue:taskRows.filter(x=>x.status==='overdue').length,completed:taskRows.filter(x=>x.status==='completed').length,escalated:taskRows.filter(x=>x.status==='escalated').length,incidentsOpen:incidentRows.filter(x=>x.status!=='closed').length,incidentsHigh:incidentRows.filter(x=>['high','critical'].includes(x.severity)&&x.status!=='closed').length,incidentsOverdue:incidentRows.filter(x=>x.status!=='closed'&&x.investigation_due_at&&x.investigation_due_at<new Date().toISOString().slice(0,10)).length,incidentsSafeguarding:incidentRows.filter(x=>x.status!=='closed'&&Number(x.safeguarding_required)===1).length,handoversUnread:handoverRows.filter(x=>!x.acknowledged_at).length,careDue:canViewOperations?careDue?.count||0:0,riskDue:canViewOperations?riskDue?.count||0:0,activeStaff:(staff.results||[]).length,activeClients:(clients.results||[]).length};
  const timeline=[...taskRows.slice(0,20).map(x=>({type:'task',title:x.title,detail:`${x.status}${x.client_name?' · '+x.client_name:''}`,created_at:x.updated_at||x.created_at})),...incidentRows.slice(0,20).map(x=>({type:'incident',title:x.title,detail:`${x.severity} · ${x.status}`,created_at:x.updated_at||x.created_at})),...handoverRows.slice(0,10).map(x=>({type:'handover',title:`${x.shift} handover`,detail:x.summary,created_at:x.created_at}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,25);
  return json({stats,tasks:taskRows,incidents:incidentRows,incidentUpdates:(incidentUpdates.results||[]),handovers:handoverRows,clients:(canViewTasks||canViewIncidents||canViewOperations)?clients.results||[]:[],staff:(canViewTasks||canViewOperations)?staff.results||[]:[],timeline});
}
async function createOperationsTask(request,db,session){const i=await readJson(request),title=clean(i.title),clientId=clean(i.clientId)||null,staffId=clean(i.staffId)||null;if(!title)return json({error:{code:'VALIDATION_ERROR',message:'Enter a task title.'}},400);let branchId=activeBranch(session)||null;if(clientId){const client=await ensureClient(db,session,clientId);if(!client)return notFound('Client');branchId=client.branch_id||branchId;}if(staffId){const staff=await db.prepare(`SELECT id,branch_id FROM staff WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND status='Active'`).bind(staffId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!staff)return notFound('Staff member');if(branchId&&staff.branch_id&&branchId!==staff.branch_id)return json({error:{code:'BRANCH_MISMATCH',message:'The task client and assigned staff member must belong to the same branch.'}},409);branchId=branchId||staff.branch_id||null;}const id=crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO operations_tasks(id,organisation_id,branch_id,client_id,assigned_staff_id,title,description,category,priority,status,due_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,branchId,clientId,staffId,title,clean(i.description),clean(i.category)||'Care',['low','normal','high','critical'].includes(clean(i.priority))?clean(i.priority):'normal','open',clean(i.dueAt)||null,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'operations.task_created','task',id,{title,clientId,staffId})]);return json({ok:true,id});}
async function updateOperationsTask(db,session,id,action){const row=await db.prepare('SELECT title FROM operations_tasks WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!row)return notFound('Task');const status=action==='complete'?'completed':'escalated',column=action==='complete'?'completed_at':'escalated_at';await db.batch([db.prepare(`UPDATE operations_tasks SET status=?,${column}=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,`operations.task_${action}`,'task',id,{title:row.title})]);return json({ok:true});}
async function createOperationsIncident(request,env,session){
  const db=env.DB;
  const input=normaliseIncidentReport(await readJson(request));if(input.error)return json({error:{code:'VALIDATION_ERROR',message:input.error}},400);
  let client=null;if(input.clientId){client=await db.prepare(`SELECT id,branch_id FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND archived_at IS NULL`).bind(input.clientId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!client)return notFound('Client');}
  const id=crypto.randomUUID(),reference=incidentReference(id),branchId=client?.branch_id||activeBranch(session)||null;
  await db.batch([
    db.prepare(`INSERT INTO operations_incidents(id,organisation_id,reference_number,branch_id,client_id,reported_by,category,severity,title,description,status,occurred_at,injury_or_harm,immediate_action,witnesses,safeguarding_required,external_notification,external_reference,duty_of_candour_required) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,reference,branchId,input.clientId||null,session.user_id,input.category,input.severity,input.title,input.description,input.occurredAt||null,input.injuryOrHarm,input.immediateAction,input.witnesses,input.safeguardingRequired?1:0,input.externalNotification,input.externalReference,(['high','critical'].includes(input.severity)||Boolean(input.injuryOrHarm))?1:0),
    db.prepare(`INSERT INTO incident_updates(id,organisation_id,incident_id,update_type,status,note,created_by) VALUES(?,?,?,'reported','open',?,?)`).bind(crypto.randomUUID(),session.organisation_id,id,`Incident reported as ${input.severity} severity.`,session.user_id),
    auditStatement(db,session.organisation_id,session.user_id,'operations.incident_created','incident',id,{reference,title:input.title,severity:input.severity,safeguardingRequired:input.safeguardingRequired})
  ]);
  const emailDeliveries=await sendCareIncidentEmails(env,session,{id,reference,severity:input.severity,occurredAt:input.occurredAt||new Date().toISOString()});
  return json({ok:true,id,reference,emailDeliveries},201);
}

async function sendCareIncidentEmails(env,session,incident){
  const recipients=await env.DB.prepare(`SELECT id,email,display_name,access_level FROM users WHERE organisation_id=? AND status='active' AND access_level IN ('organisation_owner','organisation_admin','registered_manager') ORDER BY access_level,display_name LIMIT 20`).bind(session.organisation_id).all();
  const deliveries=[];
  for(const recipient of recipients.results||[]){
    const result=await requestPlatformTransactionalEmail(env,{organisationId:session.organisation_id,templateKey:'incident_alert',sourceEventId:`care-incident:${incident.id}:recipient:${recipient.id}`,recipientEmail:recipient.email,recipientName:recipient.display_name,accessLabel:clean(recipient.access_level).replaceAll('_',' '),incidentReference:incident.reference,incidentSeverity:incident.severity,incidentOccurredAt:incident.occurredAt});
    deliveries.push({recipientId:recipient.id,status:result.status||'failed'});
  }
  await auditStatement(env.DB,session.organisation_id,session.user_id,'email.incident_alert.dispatched','incident',incident.id,{recipients:deliveries.length,statuses:deliveries.map(item=>item.status)}).run();
  return deliveries;
}
async function reviewOperationsIncident(request,db,session,id){
  const input=normaliseIncidentReview(await readJson(request));if(input.error)return json({error:{code:'VALIDATION_ERROR',message:input.error}},400);
  const row=await db.prepare(`SELECT title,status,severity,safeguarding_required,duty_of_candour_required FROM operations_incidents WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''}`).bind(id,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!row)return notFound('Incident');
  if(input.status==='closed'&&['high','critical'].includes(row.severity)&&(!input.investigationOwner||!input.rootCause||!input.actionsRequired||!input.lessonsLearned))return json({error:{code:'INCIDENT_CLOSURE_INCOMPLETE',message:'High and critical incidents require an investigation owner, root cause, actions and lessons learned before closure.'}},409);
  if(input.status==='closed'&&Number(row.safeguarding_required)===1&&['not_required','considering'].includes(input.externalNotification))return json({error:{code:'SAFEGUARDING_DECISION_REQUIRED',message:'Record the safeguarding or external notification route before closing this incident.'}},409);
  if(input.status==='closed'&&Number(row.duty_of_candour_required)===1&&!input.dutyOfCandourCompleted)return json({error:{code:'DUTY_OF_CANDOUR_REQUIRED',message:'Confirm that the duty-of-candour process is complete before closure.'}},409);
  await db.batch([
    db.prepare(`UPDATE operations_incidents SET status=?,manager_review=?,investigation_owner=?,investigation_due_at=?,root_cause=?,actions_required=?,lessons_learned=?,external_notification=?,external_reference=?,closure_rationale=?,duty_of_candour_completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE duty_of_candour_completed_at END,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,closed_at=CASE WHEN ?='closed' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(input.status,input.review,input.investigationOwner,input.investigationDueAt||null,input.rootCause,input.actionsRequired,input.lessonsLearned,input.externalNotification,input.externalReference,input.closureRationale,input.dutyOfCandourCompleted?1:0,session.user_id,input.status,id,session.organisation_id),
    db.prepare(`INSERT INTO incident_updates(id,organisation_id,incident_id,update_type,status,note,created_by) VALUES(?,?,?,'management_review',?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,id,input.status,input.review,session.user_id),
    auditStatement(db,session.organisation_id,session.user_id,input.status==='closed'?'operations.incident_closed':'operations.incident_reviewed','incident',id,{title:row.title,fromStatus:row.status,toStatus:input.status})
  ]);return json({ok:true,status:input.status});
}

async function ensureFinanceSettings(db,session){
  await db.prepare(`INSERT OR IGNORE INTO finance_settings(organisation_id,updated_by) VALUES(?,?)`).bind(session.organisation_id,session.user_id).run();
}
async function financeWorkspace(db,session){
  await ensureFinanceSettings(db,session);
  const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session);
  const [settings,organisation,transactions,invoices,clients,canManage]=await Promise.all([
    db.prepare(`SELECT provider,provider_url,provider_label,invoice_prefix,next_invoice_number,default_tax_basis_points,updated_at FROM finance_settings WHERE organisation_id=?`).bind(org).first(),
    db.prepare(`SELECT name,currency,invoice_footer FROM organisations WHERE id=?`).bind(org).first(),
    db.prepare(`SELECT t.*,c.first_name||' '||c.last_name client_name FROM finance_transactions t LEFT JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id WHERE t.organisation_id=? ${scoped?'AND t.branch_id=?':''} ORDER BY date(t.transaction_date) DESC,datetime(t.created_at) DESC LIMIT 250`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT i.*,c.first_name||' '||c.last_name client_name FROM finance_invoices i LEFT JOIN clients c ON c.id=i.client_id AND c.organisation_id=i.organisation_id WHERE i.organisation_id=? ${scoped?'AND i.branch_id=?':''} ORDER BY date(i.issue_date) DESC,datetime(i.created_at) DESC LIMIT 250`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org,...(scoped?[branch]:[])).all(),
    userHasPermission(db,session,'finance.manage')
  ]);
  const today=new Date().toISOString().slice(0,10),invoiceRows=(invoices.results||[]).map(row=>({...row,display_status:row.status==='sent'&&row.due_date<today?'overdue':row.status}));
  return json({settings:settings||{},organisation:organisation||{},metrics:calculateFinanceMetrics(transactions.results||[],invoiceRows),transactions:transactions.results||[],invoices:invoiceRows,clients:clients.results||[],canManage,generatedAt:new Date().toISOString()});
}
async function createFinanceTransaction(request,db,session){
  const input=normaliseFinanceTransaction(await readJson(request));if(input.error)return json({error:{code:'VALIDATION_ERROR',message:input.error}},400);
  let client=null;if(input.clientId){client=await db.prepare(`SELECT id,branch_id FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND archived_at IS NULL`).bind(input.clientId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!client)return notFound('Client');}
  const id=crypto.randomUUID(),branchId=client?.branch_id||activeBranch(session)||null;
  await db.batch([
    db.prepare(`INSERT INTO finance_transactions(id,organisation_id,branch_id,client_id,transaction_type,category,description,amount_pence,tax_pence,transaction_date,payment_status,reference,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,branchId,input.clientId||null,input.type,input.category,input.description,input.amountPence,input.taxPence,input.transactionDate,input.paymentStatus,input.reference,session.user_id),
    auditStatement(db,session.organisation_id,session.user_id,'finance.transaction_created','finance_transaction',id,{type:input.type,amountPence:input.amountPence,category:input.category})
  ]);return json({ok:true,id},201);
}
async function createFinanceInvoice(request,db,session){
  const input=normaliseInvoice(await readJson(request));if(input.error)return json({error:{code:'VALIDATION_ERROR',message:input.error}},400);
  const client=await db.prepare(`SELECT id,branch_id,first_name,last_name,preferred_name FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND archived_at IS NULL`).bind(input.clientId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!client)return notFound('Client');
  await ensureFinanceSettings(db,session);const claimed=await db.prepare(`UPDATE finance_settings SET next_invoice_number=MAX(2,next_invoice_number+1),updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? RETURNING invoice_prefix,next_invoice_number-1 AS claimed_number`).bind(session.user_id,session.organisation_id).first();
  const sequence=Math.max(1,Number(claimed?.claimed_number)||1),prefix=clean(claimed?.invoice_prefix)||'CC',number=`${prefix}-${input.issueDate.slice(0,4)}-${String(sequence).padStart(4,'0')}`,id=crypto.randomUUID(),itemId=crypto.randomUUID(),customerName=[client.preferred_name||client.first_name,client.last_name].filter(Boolean).join(' ');
  await db.batch([
    db.prepare(`INSERT INTO finance_invoices(id,organisation_id,branch_id,invoice_number,client_id,customer_name,issue_date,due_date,status,subtotal_pence,tax_pence,total_pence,notes,created_by) VALUES(?,?,?,?,?,?,?,?,'draft',?,?,?,?,?)`).bind(id,session.organisation_id,client.branch_id||activeBranch(session)||null,number,input.clientId,customerName,input.issueDate,input.dueDate,input.subtotalPence,input.taxPence,input.totalPence,input.notes,session.user_id),
    db.prepare(`INSERT INTO finance_invoice_items(id,organisation_id,invoice_id,description,quantity,unit_price_pence,tax_basis_points,subtotal_pence,tax_pence,total_pence) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(itemId,session.organisation_id,id,input.description,input.quantity,input.unitPricePence,input.taxBasisPoints,input.subtotalPence,input.taxPence,input.totalPence),
    auditStatement(db,session.organisation_id,session.user_id,'finance.invoice_created','finance_invoice',id,{invoiceNumber:number,clientId:input.clientId,totalPence:input.totalPence})
  ]);return json({ok:true,id,invoiceNumber:number},201);
}
async function updateFinanceInvoiceStatus(request,db,session,id){
  const input=await readJson(request),status=clean(input.status);if(!['sent','paid','void'].includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Choose sent, paid or void.'}},400);
  const invoice=await db.prepare(`SELECT * FROM finance_invoices WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''}`).bind(id,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();if(!invoice)return notFound('Invoice');
  if(['paid','void'].includes(invoice.status))return json({error:{code:'INVOICE_FINALISED',message:'A paid or void invoice cannot be changed.'}},409);
  const statements=[db.prepare(`UPDATE finance_invoices SET status=?,sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,paid_at=CASE WHEN ?='paid' THEN CURRENT_TIMESTAMP ELSE paid_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(status,status,status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,`finance.invoice_${status}`,'finance_invoice',id,{invoiceNumber:invoice.invoice_number,totalPence:invoice.total_pence})];
  if(status==='paid')statements.push(db.prepare(`INSERT OR IGNORE INTO finance_transactions(id,organisation_id,branch_id,client_id,invoice_id,transaction_type,category,description,amount_pence,tax_pence,transaction_date,payment_status,reference,created_by) VALUES(?,?,?,?,?,'income','Care income',?,?,?,date('now'),'cleared',?,?)`).bind(crypto.randomUUID(),session.organisation_id,invoice.branch_id,invoice.client_id,id,`Payment for ${invoice.invoice_number}`,invoice.total_pence,invoice.tax_pence,invoice.invoice_number,session.user_id));
  await db.batch(statements);return json({ok:true,status});
}
async function updateFinanceSettings(request,db,session){
  const input=validateFinanceSettings(await readJson(request));if(input.error)return json({error:{code:'VALIDATION_ERROR',message:input.error}},400);await ensureFinanceSettings(db,session);
  await db.batch([
    db.prepare(`UPDATE finance_settings SET provider=?,provider_url=?,provider_label=?,invoice_prefix=?,default_tax_basis_points=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=?`).bind(input.provider,input.providerUrl,input.providerLabel,input.invoicePrefix,input.defaultTaxBasisPoints,session.user_id,session.organisation_id),
    auditStatement(db,session.organisation_id,session.user_id,'finance.settings_updated','finance_settings',session.organisation_id,{provider:input.provider,linked:Boolean(input.providerUrl)})
  ]);return json({ok:true});
}

function reportRange(url){
  const today=new Date(),fallbackTo=today.toISOString().slice(0,10),fallbackFrom=new Date(today.getTime()-29*86400000).toISOString().slice(0,10),from=clean(url.searchParams.get('from'))||fallbackFrom,to=clean(url.searchParams.get('to'))||fallbackTo;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return {error:'Choose a valid report date range.'};
  const days=Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000)+1;if(days<1||days>366)return {error:'Reports can cover up to 366 days at a time.'};return {from,to,days};
}
async function reportsWorkspace(db,session,url){
  const range=reportRange(url);if(range.error)return json({error:{code:'VALIDATION_ERROR',message:range.error}},400);
  const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session),canFinance=await userHasPermission(db,session,'finance.view');
  const [visits,incidents,tasks,staff,plans,clients,financeTransactions,financeInvoices,canExport]=await Promise.all([
    db.prepare(`SELECT v.id,v.client_id,v.visit_type,v.scheduled_start,v.scheduled_end,v.actual_start,v.actual_end,v.status,c.first_name||' '||c.last_name client_name FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id WHERE v.organisation_id=? ${scoped?'AND v.branch_id=?':''} AND date(v.scheduled_start) BETWEEN date(?) AND date(?) AND COALESCE(v.rota_status,'published')!='cancelled' AND v.status!='cancelled' ORDER BY datetime(v.scheduled_start) LIMIT 10000`).bind(org,...(scoped?[branch]:[]),range.from,range.to).all(),
    db.prepare(`SELECT i.id,i.reference_number,i.client_id,i.category,i.severity,i.title,i.status,i.occurred_at,i.created_at,i.closed_at,i.safeguarding_required,c.first_name||' '||c.last_name client_name FROM operations_incidents i LEFT JOIN clients c ON c.id=i.client_id AND c.organisation_id=i.organisation_id WHERE i.organisation_id=? ${scoped?'AND i.branch_id=?':''} AND date(COALESCE(i.occurred_at,i.created_at)) BETWEEN date(?) AND date(?) ORDER BY datetime(COALESCE(i.occurred_at,i.created_at)) DESC LIMIT 10000`).bind(org,...(scoped?[branch]:[]),range.from,range.to).all(),
    db.prepare(`SELECT id,status,priority,category,created_at,completed_at FROM operations_tasks WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND date(created_at) BETWEEN date(?) AND date(?) LIMIT 10000`).bind(org,...(scoped?[branch]:[]),range.from,range.to).all(),
    db.prepare(`SELECT id,status,dbs_expiry,training_expiry FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''}`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,status,review_date FROM care_plans WHERE organisation_id=? ${scoped?'AND branch_id=?':''}`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,status,risk FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL`).bind(org,...(scoped?[branch]:[])).all(),
    canFinance?db.prepare(`SELECT * FROM finance_transactions WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND date(transaction_date) BETWEEN date(?) AND date(?) LIMIT 10000`).bind(org,...(scoped?[branch]:[]),range.from,range.to).all():Promise.resolve({results:[]}),
    canFinance?db.prepare(`SELECT * FROM finance_invoices WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND date(issue_date) BETWEEN date(?) AND date(?) LIMIT 10000`).bind(org,...(scoped?[branch]:[]),range.from,range.to).all():Promise.resolve({results:[]}),
    userHasPermission(db,session,'reports.export')
  ]);
  const visitRows=visits.results||[],incidentRows=incidents.results||[],summary=calculateReportSummary({visits:visitRows,incidents:incidentRows,tasks:tasks.results||[],staff:staff.results||[],plans:plans.results||[]});
  const dailyMap=new Map();for(const visit of visitRows){const day=String(visit.scheduled_start||'').slice(0,10),row=dailyMap.get(day)||{date:day,total:0,completed:0,missed:0,minutes:0};row.total++;if(visit.status==='completed')row.completed++;if(visit.status==='missed')row.missed++;const start=new Date(visit.actual_start||visit.scheduled_start).getTime(),end=new Date(visit.actual_end||visit.scheduled_end||visit.scheduled_start).getTime();if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)row.minutes+=Math.round((end-start)/60000);dailyMap.set(day,row);}
  const categoryMap=new Map();for(const incident of incidentRows){const key=incident.category||'General',row=categoryMap.get(key)||{category:key,total:0,open:0,high:0};row.total++;if(incident.status!=='closed')row.open++;if(['high','critical'].includes(incident.severity))row.high++;categoryMap.set(key,row);}
  const activeClients=(clients.results||[]).filter(row=>row.status==='Active'),highRiskClients=activeClients.filter(row=>String(row.risk).toLowerCase()==='high').length;
  const financeRows=financeTransactions.results||[],invoiceRows=financeInvoices.results||[],clearedFinance=financeRows.filter(row=>row.payment_status==='cleared');
  const finance=canFinance?{monthIncomePence:clearedFinance.filter(row=>row.transaction_type==='income').reduce((sum,row)=>sum+Number(row.amount_pence||0),0),monthExpensePence:clearedFinance.filter(row=>row.transaction_type==='expense').reduce((sum,row)=>sum+Number(row.amount_pence||0),0),outstandingPence:invoiceRows.filter(row=>row.status==='sent').reduce((sum,row)=>sum+Number(row.total_pence||0),0),overdueInvoices:invoiceRows.filter(row=>row.status==='sent'&&row.due_date<new Date().toISOString().slice(0,10)).length}:null;if(finance)finance.monthNetPence=finance.monthIncomePence-finance.monthExpensePence;
  return json({range,summary:{...summary,clients:{active:activeClients.length,highRisk:highRiskClients}},dailyVisits:[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)),incidentCategories:[...categoryMap.values()].sort((a,b)=>b.total-a.total),recentIncidents:incidentRows.slice(0,100),recentVisits:visitRows.slice(-100).reverse(),exportRecords:canExport?{incidents:incidentRows,visits:visitRows,tasks:tasks.results||[],carePlans:plans.results||[],staff:staff.results||[],financeTransactions:canFinance?financeRows:[],financeInvoices:canFinance?invoiceRows:[]}:null,finance,canExport,generatedAt:new Date().toISOString(),recordLimitReached:[visitRows,incidentRows,tasks.results||[],financeRows,invoiceRows].some(rows=>rows.length>=10000)});
}
async function createShiftHandover(request,db,session){const i=await readJson(request),summary=clean(i.summary);if(!summary)return json({error:{code:'VALIDATION_ERROR',message:'Enter a handover summary.'}},400);const id=crypto.randomUUID(),branchId=activeBranch(session)||null;await db.batch([db.prepare(`INSERT INTO shift_handovers(id,organisation_id,branch_id,shift,summary,concerns,outstanding_actions,created_by) VALUES(?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,branchId,clean(i.shift)||'Day',summary,clean(i.concerns),clean(i.outstandingActions),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'operations.handover_created','handover',id,{shift:i.shift,branchId})]);return json({ok:true,id});}
async function acknowledgeShiftHandover(db,session,id){const row=await db.prepare('SELECT shift FROM shift_handovers WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!row)return notFound('Handover');await db.batch([db.prepare('UPDATE shift_handovers SET acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(session.user_id,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'operations.handover_acknowledged','handover',id,{shift:row.shift})]);return json({ok:true});}


async function refreshCareDeliveryAlerts(db, session) {
  const org=session.organisation_id, scoped=branchRestricted(session), branch=activeBranch(session), today=new Date().toISOString().slice(0,10), in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const [plans,risks,clients]=await Promise.all([
    db.prepare(`SELECT id,client_id,title,review_date,approval_status,status FROM care_plans WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status<>'Archived'`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,client_id,title,severity,review_date,status FROM risk_assessments WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active'`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,first_name,last_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status='Active'`).bind(org,...(scoped?[branch]:[])).all()
  ]);
  const names=Object.fromEntries((clients.results||[]).map(c=>[c.id,`${c.first_name} ${c.last_name}`]));
  const statements=[];
  for(const p of plans.results||[]){
    if(p.approval_status!=='approved') statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,care_plan_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,p.client_id,p.id,'care_plan_approval','warning',`Care plan awaiting approval: ${names[p.client_id]||'Client'}`,p.title,p.review_date));
    if(p.status==='Active'&&p.review_date&&p.review_date<=in30) statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,care_plan_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,p.client_id,p.id,'care_plan_review',p.review_date<today?'critical':'warning',`Care plan review ${p.review_date<today?'overdue':'due soon'}: ${names[p.client_id]||'Client'}`,p.title,p.review_date));
    if(p.status==='Active'&&p.review_date) statements.push(db.prepare(`INSERT OR IGNORE INTO care_review_schedule(id,organisation_id,client_id,record_type,record_id,due_date) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,p.client_id,'care_plan',p.id,p.review_date));
  }
  for(const r of risks.results||[]){
    if(r.severity==='High') statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,risk_assessment_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,r.client_id,r.id,'high_risk','critical',`High risk: ${names[r.client_id]||'Client'}`,r.title,r.review_date));
    if(r.review_date&&r.review_date<=in30) statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,risk_assessment_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,r.client_id,r.id,'risk_review',r.review_date<today?'critical':'warning',`Risk review ${r.review_date<today?'overdue':'due soon'}: ${names[r.client_id]||'Client'}`,r.title,r.review_date));
    if(r.review_date) statements.push(db.prepare(`INSERT OR IGNORE INTO care_review_schedule(id,organisation_id,client_id,record_type,record_id,due_date) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,r.client_id,'risk',r.id,r.review_date));
  }
  if(statements.length) await db.batch(statements);
}
async function careDeliveryDashboard(db,session){
  await refreshCareDeliveryAlerts(db,session); const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session),today=new Date().toISOString().slice(0,10);
  const [plans,risks,alerts,reviews,visits]=await Promise.all([
    db.prepare(`SELECT cp.*,c.first_name||' '||c.last_name client_name FROM care_plans cp JOIN clients c ON c.id=cp.client_id AND c.organisation_id=cp.organisation_id WHERE cp.organisation_id=? ${scoped?'AND cp.branch_id=?':''} ORDER BY cp.review_date`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT r.*,c.first_name||' '||c.last_name client_name FROM risk_assessments r JOIN clients c ON c.id=r.client_id AND c.organisation_id=r.organisation_id WHERE r.organisation_id=? ${scoped?'AND r.branch_id=?':''} AND r.status='Active' ORDER BY CASE r.severity WHEN 'High' THEN 0 ELSE 1 END,r.review_date`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT a.*,c.first_name||' '||c.last_name client_name FROM care_delivery_alerts a JOIN clients c ON c.id=a.client_id AND c.organisation_id=a.organisation_id WHERE a.organisation_id=? ${scoped?'AND c.branch_id=?':''} AND a.status='open' ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END,a.due_date LIMIT 50`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT r.* FROM care_review_schedule r JOIN clients c ON c.id=r.client_id AND c.organisation_id=r.organisation_id WHERE r.organisation_id=? ${scoped?'AND c.branch_id=?':''} AND r.status='scheduled' ORDER BY r.due_date LIMIT 50`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT COUNT(*) total,COUNT(CASE WHEN rota_status='draft' THEN 1 END) draft FROM care_visits WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND date(scheduled_start)>=date('now')`).bind(org,...(scoped?[branch]:[])).first()
  ]);
  const planRows=plans.results||[],active=planRows.filter(x=>x.status==='Active'), pending=planRows.filter(x=>x.status!=='Archived'&&x.approval_status!=='approved').length, overdue=active.filter(x=>x.review_date&&x.review_date<today).length, high=(risks.results||[]).filter(x=>x.severity==='High').length;
  return json({metrics:{activePlans:active.length,pendingApproval:pending,overdueReviews:overdue,highRisks:high,openAlerts:(alerts.results||[]).length,futureVisits:Number(visits?.total||0),draftVisits:Number(visits?.draft||0)},alerts:alerts.results||[],reviews:reviews.results||[],plans:(plans.results||[]).map(r=>({...toCarePlan(r),clientName:r.client_name})),risks:risks.results||[]});
}
async function carePlanAction(request,db,session,id,action){
  const plan=await db.prepare(`SELECT * FROM care_plans WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id).first(); if(!plan)return notFound('Care plan');
  if(action==='approve'){
    const policy=await db.prepare('SELECT require_independent_care_plan_approval FROM organisation_security_policies WHERE organisation_id=?').bind(session.organisation_id).first();
    if(policy?.require_independent_care_plan_approval!==0&&[plan.created_by,plan.submitted_by].filter(Boolean).includes(session.user_id))return json({error:{code:'INDEPENDENT_APPROVAL_REQUIRED',message:'A different authorised manager must approve this care plan.'}},409);
    const sections=await carePlanSections(db,session.organisation_id,[id]),readiness=carePlanReadiness(toCarePlan(plan),sections[id]||[]);
    if(!readiness.ready)return json({error:{code:'CARE_PLAN_NOT_READY',message:`This care plan is not ready for approval: ${readiness.missing.join(' ')}`,details:readiness}},409);
    await db.batch([db.prepare(`UPDATE care_plans SET status='Active',approval_status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(session.user_id,id,session.organisation_id),db.prepare(`UPDATE care_delivery_alerts SET status='acknowledged',acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND care_plan_id=? AND alert_type='care_plan_approval' AND status='open'`).bind(session.user_id,session.organisation_id,id),db.prepare(`UPDATE client_onboarding_items SET status='completed',completed_at=CURRENT_TIMESTAMP,completed_by=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND client_id=? AND item_key='care_plan'`).bind(session.user_id,session.organisation_id,plan.client_id),auditStatement(db,session.organisation_id,session.user_id,'care_plan.approved','care_plan',id,{clientId:plan.client_id})]);
    return json({ok:true,status:'approved'});
  }
  if(plan.approval_status!=='approved')return json({error:{code:'APPROVAL_REQUIRED',message:'Approve the care plan before generating visits.'}},409);
  const reqs=await db.prepare(`SELECT * FROM client_visit_requirements WHERE organisation_id=? AND client_id=? AND status='active'`).bind(session.organisation_id,plan.client_id).all();
  if(!(reqs.results||[]).length)return json({error:{code:'NO_VISIT_REQUIREMENTS',message:'Add visit requirements to the client before generating visits.'}},409);
  const statements=[];let count=0;
  for(const r of reqs.results||[]){const requirement={visitType:r.visit_type,days:JSON.parse(r.days_json||'[]'),preferredTime:r.preferred_time,windowMinutes:r.window_minutes,durationMinutes:r.duration_minutes,carersRequired:r.carers_required,notes:r.notes,startDate:r.start_date,endDate:r.end_date};for(const date of generatedDates(requirement)){const day=date.toISOString().slice(0,10),start=new Date(`${day}T${requirement.preferredTime}:00`),end=new Date(start.getTime()+requirement.durationMinutes*60000);statements.push(db.prepare(`INSERT OR IGNORE INTO care_visits(id,organisation_id,branch_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,requirement_id,requirement_occurrence_date,created_by,protected_time_rule,protected_time_reason,protected_window_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,plan.branch_id||null,plan.client_id,null,requirement.visitType,start.toISOString(),end.toISOString(),'scheduled','care_plan','draft',r.id,'requirement',r.id,day,session.user_id,r.scheduling_rule||'flexible',r.time_critical_reason||'',Number(r.window_minutes)||0));count++;}}
  statements.push(db.prepare(`UPDATE care_plans SET visit_generation_status='generated',visits_generated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id));statements.push(auditStatement(db,session.organisation_id,session.user_id,'care_plan.visits_generated','care_plan',id,{clientId:plan.client_id,attempted:count}));await db.batch(statements);return json({ok:true,visitsGenerated:count});
}
async function acknowledgeCareAlert(db,session,id){const result=await db.prepare(`UPDATE care_delivery_alerts SET status='acknowledged',acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(session.user_id,id,session.organisation_id).run();if(!result.meta.changes)return notFound('Alert');return json({ok:true});}

async function carerDashboard(db,session){
  const isCarer=['carer','senior_carer'].includes(session.access_level);
  if(!isCarer)return forbidden();
  if(!session.staff_id)return json({linked:false,staffId:null,visits:[],history:[],metrics:{today:0,completed:0,inProgress:0,late:0},message:'Your CoreCare login is not linked to a staff record. Ask a manager to open your staff profile and link this login.'});

  // CoreCare service days run from 06:00 to 06:00. Build UTC boundaries in
  // application code rather than relying on SQLite localtime behaviour in D1.
  const now=new Date();
  const serviceStart=new Date(now);
  serviceStart.setHours(6,0,0,0);
  if(now<serviceStart)serviceStart.setDate(serviceStart.getDate()-1);
  const serviceEnd=new Date(serviceStart);serviceEnd.setDate(serviceEnd.getDate()+1);

  const base=`SELECT v.*,c.first_name||' '||c.last_name client_name,c.preferred_name client_preferred_name,c.address_line_1,c.address_line_2,c.town,c.postcode
    FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id
    WHERE v.organisation_id=? AND v.staff_id=? AND COALESCE(v.rota_status,'published')='published'`;
  const [todayRows,historyRows]=await Promise.all([
    db.prepare(`${base} AND datetime(v.scheduled_start)>=datetime(?) AND datetime(v.scheduled_start)<datetime(?) AND COALESCE(v.rota_status,'')!='cancelled' AND v.status!='cancelled' ORDER BY datetime(v.scheduled_start)`).bind(session.organisation_id,session.staff_id,serviceStart.toISOString(),serviceEnd.toISOString()).all(),
    db.prepare(`${base} AND v.status='completed' AND datetime(v.scheduled_start)<datetime(?) ORDER BY datetime(COALESCE(v.actual_end,v.scheduled_end,v.scheduled_start)) DESC LIMIT 20`).bind(session.organisation_id,session.staff_id,serviceStart.toISOString()).all()
  ]);

  const visits=todayRows.results||[],history=historyRows.results||[];
  // Care records were introduced in a later migration. Keep the dashboard usable
  // even on an organisation whose migration is still pending.
  let recorded=new Set();
  try{
    const ids=[...visits,...history].map(v=>v.id);
    if(ids.length){
      const marks=ids.map(()=>'?').join(',');
      const rows=await db.prepare(`SELECT DISTINCT visit_id FROM visit_care_records WHERE organisation_id=? AND visit_id IN (${marks})`).bind(session.organisation_id,...ids).all();
      recorded=new Set((rows.results||[]).map(r=>r.visit_id));
    }
  }catch(error){console.warn('Carer dashboard care-record lookup skipped',String(error));}

  const clock=Date.now();
  for(const v of [...visits,...history]){
    v.has_care_record=recorded.has(v.id)?1:0;
    v.address=[v.address_line_1,v.address_line_2,v.town,v.postcode].filter(Boolean).join(', ');
  }
  for(const v of visits){
    const start=new Date(v.scheduled_start).getTime(),end=v.scheduled_end?new Date(v.scheduled_end).getTime():start+3600000;
    if(v.status==='scheduled'&&start+15*60000<clock)v.live_status='late';
    else if(v.status==='in_progress'&&end<clock)v.live_status='overrunning';
    else if(v.status==='scheduled'&&Math.abs(start-clock)<=15*60000)v.live_status='due';
    else v.live_status=v.status;
  }
  const active=visits.find(v=>v.status==='in_progress')||null,next=visits.find(v=>v.status==='scheduled')||null;
  return json({linked:true,staffId:session.staff_id,serviceDay:{start:serviceStart.toISOString(),end:serviceEnd.toISOString()},visits,history,activeVisitId:active?.id||null,nextVisitId:next?.id||null,metrics:{today:visits.length,completed:visits.filter(v=>v.status==='completed').length,inProgress:visits.filter(v=>v.status==='in_progress').length,late:visits.filter(v=>v.live_status==='late'||v.live_status==='overrunning').length}});
}

async function dashboardSummary(db, session) {
  const org=session.organisation_id,scoped=branchRestricted(session),branch=activeBranch(session),now=new Date();
  const serviceStart=new Date(now);serviceStart.setHours(6,0,0,0);if(now<serviceStart)serviceStart.setDate(serviceStart.getDate()-1);
  const serviceEnd=new Date(serviceStart);serviceEnd.setDate(serviceEnd.getDate()+1);
  const [clients,staff,plans,risks,visits,tasks,incidents,auditRows]=await Promise.all([
    db.prepare(`SELECT id,status,risk,next_review,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND archived_at IS NULL`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT id,status,dbs_expiry,training_expiry,first_name,last_name,preferred_name FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''}`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT p.id,p.status,p.review_date,p.title,p.client_id,c.first_name||' '||c.last_name client_name FROM care_plans p JOIN clients c ON c.id=p.client_id AND c.organisation_id=p.organisation_id WHERE p.organisation_id=? ${scoped?'AND c.branch_id=?':''}`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT r.id,r.status,r.severity,r.review_date,r.title,r.client_id,c.first_name||' '||c.last_name client_name FROM risk_assessments r JOIN clients c ON c.id=r.client_id AND c.organisation_id=r.organisation_id WHERE r.organisation_id=? ${scoped?'AND c.branch_id=?':''}`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT v.id,v.client_id,v.staff_id,v.visit_type,v.scheduled_start,v.scheduled_end,v.status,v.rota_status,v.travel_conflict,v.travel_override,c.first_name||' '||c.last_name client_name,c.preferred_name client_preferred_name,s.first_name||' '||s.last_name staff_name FROM care_visits v JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id WHERE v.organisation_id=? ${scoped?'AND v.branch_id=?':''} AND datetime(v.scheduled_start)>=datetime(?) AND datetime(v.scheduled_start)<datetime(?) AND COALESCE(v.rota_status,'published')!='cancelled' AND v.status!='cancelled' ORDER BY v.scheduled_start`).bind(org,...(scoped?[branch]:[]),serviceStart.toISOString(),serviceEnd.toISOString()).all(),
    db.prepare(`SELECT id,status,priority,due_at,title FROM operations_tasks WHERE organisation_id=? ${scoped?'AND branch_id=?':''} AND status NOT IN ('completed','cancelled') ORDER BY due_at`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT i.id,i.status,i.severity,i.title,i.client_id FROM operations_incidents i LEFT JOIN clients c ON c.id=i.client_id AND c.organisation_id=i.organisation_id WHERE i.organisation_id=? ${scoped?'AND c.branch_id=?':''} AND i.status!='closed' ORDER BY i.created_at DESC`).bind(org,...(scoped?[branch]:[])).all(),
    db.prepare(`SELECT a.action,a.entity_type,a.entity_id,a.created_at,u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT 10`).bind(org).all()
  ]);
  const workforce=await workforceOverviewDataForSession(db,session);
  const live=calculateLiveDashboard({clients:clients.results,staff:staff.results,plans:plans.results,risks:risks.results,visits:visits.results,tasks:tasks.results,incidents:incidents.results,workforce},now);
  return json({...live,activity:auditRows.results||[],serviceDay:{start:serviceStart.toISOString(),end:serviceEnd.toISOString()},generatedAt:now.toISOString()});
}

const STAFF_COLUMNS = `s.id,s.first_name,s.last_name,s.preferred_name,s.job_title,s.employment_type,s.phone,s.email,s.start_date,s.status,s.dbs_expiry,s.training_expiry,s.notes,s.employee_number,s.line_manager_staff_id,s.contracted_hours,s.work_location,s.probation_end_date,s.end_date,s.emergency_contact_name,s.emergency_contact_relationship,s.emergency_contact_phone,s.supervision_frequency_days,s.next_supervision_date,s.next_appraisal_date,s.created_at,s.updated_at,
  u.id AS login_user_id,u.email AS login_email,u.access_level AS login_access_level,u.status AS login_status,u.must_change_password,u.last_login_at`;
async function listStaff(db, session, url) {
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const result = await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.organisation_id=? ${branchRestricted(session)?"AND s.branch_id=?":""} ${includeInactive ? "" : "AND s.status='Active'"} ORDER BY s.last_name COLLATE NOCASE,s.first_name COLLATE NOCASE`).bind(session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).all();
  return json({ staff: result.results.map(toStaff) });
}
async function validateStaffManager(db,session,managerId,staffId=''){
  if(!managerId)return '';
  if(staffId&&managerId===staffId)return 'A staff member cannot be their own line manager.';
  const row=await db.prepare(`SELECT id FROM staff WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''}`).bind(managerId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();
  return row?'':'Choose a line manager from this organisation and branch.';
}
async function createStaff(request, env, session) {
  const db=env.DB;
  const input = await readJson(request); const v = validateStaff(input); if (v.error) return json({error:{code:"VALIDATION_ERROR",message:v.error}},400);
  const managerError=await validateStaffManager(db,session,v.values[13]);if(managerError)return json({error:{code:'VALIDATION_ERROR',message:managerError}},400);
  const createLogin = input.createLogin === true || clean(input.createLogin)==='on' || clean(input.createLogin)==='true';
  const loginEmail = clean(input.loginEmail || input.email).toLowerCase();
  const accessLevel = clean(input.loginAccessLevel)||'carer';
  const temporaryPassword = String(input.temporaryPassword||'');
  if(createLogin && (!loginEmail || !allowedAccessLevels().includes(accessLevel) || !strongTemporaryPassword(temporaryPassword))) return json({error:{code:'VALIDATION_ERROR',message:'Enter a login email, valid access level and temporary password of at least 12 characters with upper-case, lower-case and a number.'}},400);
  if(createLogin&&(!await userHasPermission(db,session,'security.users.manage')||!canAssignStandardRole(session.access_level||session.role,accessLevel)))return forbidden('You cannot assign that access level.');
  if(createLogin){const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;}
  const id=crypto.randomUUID(), statements=[];let invitation=null;
  statements.push(db.prepare(`INSERT INTO staff (id,organisation_id,branch_id,first_name,last_name,preferred_name,job_title,employment_type,phone,email,start_date,status,dbs_expiry,training_expiry,notes,employee_number,line_manager_staff_id,contracted_hours,work_location,probation_end_date,end_date,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,supervision_frequency_days,next_supervision_date,next_appraisal_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,activeBranch(session),...v.values));
  if(createLogin){
    const secured=await hashPassword(temporaryPassword), userId=crypto.randomUUID(), displayName=`${v.values[0]} ${v.values[1]}`.trim();
    statements.push(db.prepare(`INSERT INTO users (id,organisation_id,staff_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',1)`).bind(userId,session.organisation_id,id,loginEmail,displayName,legacyRole(accessLevel),accessLevel,activeBranch(session),secured.hash,secured.salt,PASSWORD_ITERATIONS));
    statements.push(auditStatement(db,session.organisation_id,session.user_id,'staff.login_created','user',userId,{staffId:id,email:loginEmail,accessLevel}));
    invitation={userId,recipientEmail:loginEmail,recipientName:displayName,accessLabel:accessLevel.replaceAll('_',' '),temporaryPassword};
  }
  statements.push(auditStatement(db,session.organisation_id,session.user_id,"staff.created","staff",id,{name:`${v.values[0]} ${v.values[1]}`,loginCreated:createLogin}));
  try{await db.batch(statements);}catch(error){if(String(error).includes('UNIQUE'))return json({error:{code:'LOGIN_EXISTS',message:'That login email is already in use, or this staff member already has a login.'}},409);throw error;}
  const emailDelivery=invitation?await sendCareAccountEmail(env,session,{templateKey:'account_invitation',sourceEventId:`care-staff:${id}:login-created`,...invitation}):null;
  const row=await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.id=? AND s.organisation_id=?`).bind(id,session.organisation_id).first(); return json({staff:toStaff(row),emailDelivery},201);
}
async function updateStaff(request, env, session, id) {
  const db=env.DB;
  const input=await readJson(request); const v=validateStaff(input); if(v.error) return json({error:{code:"VALIDATION_ERROR",message:v.error}},400);
  const managerError=await validateStaffManager(db,session,v.values[13],id);if(managerError)return json({error:{code:'VALIDATION_ERROR',message:managerError}},400);
  const existing=await db.prepare(`SELECT s.id,u.id login_user_id,u.status login_status,u.access_level login_access_level FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.id=? AND s.organisation_id=?`).bind(id,session.organisation_id).first();
  if(!existing)return json({error:{code:'STAFF_NOT_FOUND',message:'Staff record not found.'}},404);
  const statements=[db.prepare(`UPDATE staff SET first_name=?,last_name=?,preferred_name=?,job_title=?,employment_type=?,phone=?,email=?,start_date=?,status=?,dbs_expiry=?,training_expiry=?,notes=?,employee_number=?,line_manager_staff_id=?,contracted_hours=?,work_location=?,probation_end_date=?,end_date=?,emergency_contact_name=?,emergency_contact_relationship=?,emergency_contact_phone=?,supervision_frequency_days=?,next_supervision_date=?,next_appraisal_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(...v.values,id,session.organisation_id)];let invitation=null;
  const createLogin=input.createLogin===true||clean(input.createLogin)==='on'||clean(input.createLogin)==='true';
  if(createLogin&&!existing.login_user_id){
    const loginEmail=clean(input.loginEmail||input.email).toLowerCase(),accessLevel=clean(input.loginAccessLevel)||'carer',temporaryPassword=String(input.temporaryPassword||'');
    if(!loginEmail||!allowedAccessLevels().includes(accessLevel)||!strongTemporaryPassword(temporaryPassword))return json({error:{code:'VALIDATION_ERROR',message:'Enter a login email, valid access level and temporary password of at least 12 characters with upper-case, lower-case and a number.'}},400);
    if(!await userHasPermission(db,session,'security.users.manage')||!canAssignStandardRole(session.access_level||session.role,accessLevel))return forbidden('You cannot assign that access level.');
    const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;
    const secured=await hashPassword(temporaryPassword),userId=crypto.randomUUID(),displayName=`${v.values[0]} ${v.values[1]}`.trim();
    statements.push(db.prepare(`INSERT INTO users (id,organisation_id,staff_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',1)`).bind(userId,session.organisation_id,id,loginEmail,displayName,legacyRole(accessLevel),accessLevel,activeBranch(session),secured.hash,secured.salt,PASSWORD_ITERATIONS));
    statements.push(auditStatement(db,session.organisation_id,session.user_id,'staff.login_created','user',userId,{staffId:id,email:loginEmail,accessLevel}));
    invitation={userId,recipientEmail:loginEmail,recipientName:displayName,accessLabel:accessLevel.replaceAll('_',' '),temporaryPassword};
  } else if(existing.login_user_id){
    const loginStatus=v.values[8]==='Inactive'?'disabled':(clean(input.loginStatus)||'active');
    if(loginStatus==='active'&&existing.login_status!=='active'){const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;}
    const accessLevel=allowedAccessLevels().includes(clean(input.loginAccessLevel))?clean(input.loginAccessLevel):null;
    if((accessLevel||loginStatus!==existing.login_status)&&(!await userHasPermission(db,session,'security.users.manage')||!mayManageUser(session,{access_level:existing.login_access_level})||(accessLevel&&!canAssignStandardRole(session.access_level||session.role,accessLevel))))return forbidden('You cannot change this account or assign that access level.');
    if(accessLevel) statements.push(db.prepare(`UPDATE users SET display_name=?,role=?,access_level=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(`${v.values[0]} ${v.values[1]}`.trim(),legacyRole(accessLevel),accessLevel,loginStatus,existing.login_user_id,session.organisation_id));
    else statements.push(db.prepare(`UPDATE users SET display_name=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(`${v.values[0]} ${v.values[1]}`.trim(),loginStatus,existing.login_user_id,session.organisation_id));
    if(loginStatus==='disabled')statements.push(db.prepare('DELETE FROM sessions WHERE user_id=?').bind(existing.login_user_id));
  }
  statements.push(auditStatement(db,session.organisation_id,session.user_id,"staff.updated","staff",id,{status:v.values[8]}));
  try{await db.batch(statements);}catch(error){if(String(error).includes('UNIQUE'))return json({error:{code:'LOGIN_EXISTS',message:'That login email is already in use, or this staff member already has a login.'}},409);throw error;}
  const emailDelivery=invitation?await sendCareAccountEmail(env,session,{templateKey:'account_invitation',sourceEventId:`care-staff:${id}:login-created`,...invitation}):null;
  const row=await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.id=? AND s.organisation_id=?`).bind(id,session.organisation_id).first(); return json({staff:toStaff(row),emailDelivery});
}
function validateStaff(input){
  const hours=clean(input.contractedHours),frequency=clean(input.supervisionFrequencyDays);
  const values=[clean(input.firstName),clean(input.lastName),clean(input.preferredName),clean(input.jobTitle)||"Carer",clean(input.employmentType)||"Employee",clean(input.phone),clean(input.email),clean(input.startDate),clean(input.status)||"Active",clean(input.dbsExpiry),clean(input.trainingExpiry),clean(input.notes),clean(input.employeeNumber)||null,clean(input.lineManagerStaffId)||null,hours===''?null:Math.max(0,Math.min(168,Number(hours)||0)),clean(input.workLocation),clean(input.probationEndDate)||null,clean(input.endDate)||null,clean(input.emergencyContactName),clean(input.emergencyContactRelationship),clean(input.emergencyContactPhone),frequency===''?null:Math.max(7,Math.min(365,Number(frequency)||30)),clean(input.nextSupervisionDate)||null,clean(input.nextAppraisalDate)||null];
  if(!values[0]||!values[1]) return {error:"Enter the staff member's first and last name."};
  if(!["Active","Inactive"].includes(values[8])) return {error:"Choose a valid staff status."};
  return {values};
}
function toStaff(row){return {id:row.id,firstName:row.first_name,lastName:row.last_name,preferredName:row.preferred_name||"",jobTitle:row.job_title,employmentType:row.employment_type,phone:row.phone||"",email:row.email||"",startDate:row.start_date||"",status:row.status,dbsExpiry:row.dbs_expiry||"",trainingExpiry:row.training_expiry||"",notes:row.notes||"",employeeNumber:row.employee_number||"",lineManagerStaffId:row.line_manager_staff_id||"",contractedHours:row.contracted_hours??"",workLocation:row.work_location||"",probationEndDate:row.probation_end_date||"",endDate:row.end_date||"",emergencyContactName:row.emergency_contact_name||"",emergencyContactRelationship:row.emergency_contact_relationship||"",emergencyContactPhone:row.emergency_contact_phone||"",supervisionFrequencyDays:row.supervision_frequency_days??"",nextSupervisionDate:row.next_supervision_date||"",nextAppraisalDate:row.next_appraisal_date||"",loginUserId:row.login_user_id||"",loginEmail:row.login_email||"",loginAccessLevel:row.login_access_level||"carer",loginStatus:row.login_status||"",mustChangePassword:Boolean(row.must_change_password),lastLoginAt:row.last_login_at||"",createdAt:row.created_at,updatedAt:row.updated_at};}

const WORKFORCE_TABLES={recruitment:'staff_recruitment_checks',employment:'staff_employment_history',supervisions:'staff_supervisions',training:'staff_training_records',competencies:'staff_competencies',qualifications:'staff_qualifications',appraisals:'staff_appraisals',absences:'staff_absences',hr:'staff_hr_cases'};
function workforcePermission(section,mode='view'){
  if(section==='hr'||section==='absences')return `staff.hr.${mode}`;
  if(section==='supervisions'||section==='appraisals')return `staff.supervision.${mode}`;
  if(section==='training'||section==='competencies'||section==='qualifications')return `staff.training.${mode}`;
  return `staff.records.${mode}`;
}
function staffBranchRestricted(session){return !session.is_platform_user&&['assigned_branch','assigned_work'].includes(roleScope(session.access_level))&&Boolean(session.active_branch_id||session.home_branch_id);}
async function ensureWorkforceStaff(db,session,staffId){return db.prepare(`SELECT s.* FROM staff s WHERE s.id=? AND s.organisation_id=? ${staffBranchRestricted(session)?'AND s.branch_id=?':''} LIMIT 1`).bind(staffId,session.organisation_id,...(staffBranchRestricted(session)?[session.active_branch_id||session.home_branch_id]:[])).first();}
async function workforceSettingsRow(db,organisationId){
  await db.prepare('INSERT OR IGNORE INTO organisation_workforce_settings(organisation_id) VALUES(?)').bind(organisationId).run();
  return db.prepare('SELECT * FROM organisation_workforce_settings WHERE organisation_id=?').bind(organisationId).first();
}
function workforceSettingsPayload(row){const value=normaliseWorkforceSettings(row||{});return {...value,updatedAt:row?.updated_at||''};}
async function getWorkforceSettings(db,session){return json({settings:workforceSettingsPayload(await workforceSettingsRow(db,session.organisation_id))});}
async function updateWorkforceSettings(request,db,session){
  const value=normaliseWorkforceSettings(await readJson(request));
  await db.batch([
    db.prepare(`INSERT INTO organisation_workforce_settings(organisation_id,supervision_frequency_days,new_starter_supervision_days,appraisal_frequency_days,expiry_warning_days,probation_review_days,require_staff_acknowledgement,block_expired_critical_competencies,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(organisation_id) DO UPDATE SET supervision_frequency_days=excluded.supervision_frequency_days,new_starter_supervision_days=excluded.new_starter_supervision_days,appraisal_frequency_days=excluded.appraisal_frequency_days,expiry_warning_days=excluded.expiry_warning_days,probation_review_days=excluded.probation_review_days,require_staff_acknowledgement=excluded.require_staff_acknowledgement,block_expired_critical_competencies=excluded.block_expired_critical_competencies,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,value.supervisionFrequencyDays,value.newStarterSupervisionDays,value.appraisalFrequencyDays,value.expiryWarningDays,value.probationReviewDays,value.requireStaffAcknowledgement?1:0,value.blockExpiredCriticalCompetencies?1:0,session.user_id),
    auditStatement(db,session.organisation_id,session.user_id,'staff.workforce_settings_updated','organisation',session.organisation_id,{supervisionFrequencyDays:value.supervisionFrequencyDays,newStarterSupervisionDays:value.newStarterSupervisionDays,appraisalFrequencyDays:value.appraisalFrequencyDays,expiryWarningDays:value.expiryWarningDays})
  ]);
  return getWorkforceSettings(db,session);
}
async function getTrainingCatalogue(db,session){
  const result=await db.prepare('SELECT * FROM staff_training_catalog WHERE organisation_id=? ORDER BY active DESC,category,name').bind(session.organisation_id).all();
  return json({catalogue:(result.results||[]).map(row=>({...row,roleScopes:safeJson(row.role_scope_json,[]),evidenceRequired:Boolean(row.evidence_required),criticalForAllocation:Boolean(row.critical_for_allocation),active:Boolean(row.active)}))});
}
async function saveTrainingCatalogue(request,db,session,catalogueId=null){
  const input=await readJson(request),name=clean(input.name).slice(0,200),category=(clean(input.category)||'Core skills').slice(0,120),description=clean(input.description).slice(0,3000),level=clean(input.requirementLevel)||'role';
  const allowedLevels=['core','role','optional'],allowedScopes=['all','care','clinical','management','office'];
  const roleScopes=[...new Set((Array.isArray(input.roleScopes)?input.roleScopes:[]).map(value=>clean(value).toLowerCase()).filter(value=>allowedScopes.includes(value)))];
  const renewalInput=clean(input.renewalMonths),renewalMonths=renewalInput===''?null:Number(renewalInput);
  if(!name||!allowedLevels.includes(level)||!roleScopes.length)return json({error:{code:'VALIDATION_ERROR',message:'Enter a training name, requirement level and at least one applicable workforce group.'}},400);
  if(renewalMonths!==null&&(!Number.isInteger(renewalMonths)||renewalMonths<1||renewalMonths>120))return json({error:{code:'VALIDATION_ERROR',message:'Renewal must be between 1 and 120 months, or left blank.'}},400);
  const id=catalogueId||crypto.randomUUID();
  if(catalogueId){const existing=await db.prepare('SELECT id FROM staff_training_catalog WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!existing)return notFound('Training catalogue item');}
  const values=[name,category,description,level,JSON.stringify(roleScopes.includes('all')?['all']:roleScopes),renewalMonths,input.evidenceRequired===false?0:1,input.criticalForAllocation?1:0,input.active===false?0:1];
  try{
    const statement=catalogueId
      ?db.prepare('UPDATE staff_training_catalog SET name=?,category=?,description=?,requirement_level=?,role_scope_json=?,renewal_months=?,evidence_required=?,critical_for_allocation=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(...values,id,session.organisation_id)
      :db.prepare('INSERT INTO staff_training_catalog(id,organisation_id,name,category,description,requirement_level,role_scope_json,renewal_months,evidence_required,critical_for_allocation,active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,session.organisation_id,...values,session.user_id);
    await db.batch([statement,auditStatement(db,session.organisation_id,session.user_id,catalogueId?'staff.training_catalog.updated':'staff.training_catalog.created','training_catalog',id,{name,requirementLevel:level,roleScopes})]);
  }catch(error){if(String(error).includes('UNIQUE'))return json({error:{code:'TRAINING_NAME_EXISTS',message:'A training requirement with this name already exists.'}},409);throw error;}
  return json({ok:true,id},catalogueId?200:201);
}
function workforceEventStatement(db,session,staffId,eventType,recordType,recordId,summary,metadata={}){return db.prepare('INSERT INTO staff_record_events(id,organisation_id,staff_id,event_type,record_type,record_id,summary,metadata_json,created_by) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),session.organisation_id,staffId,eventType,recordType,recordId||null,summary,JSON.stringify(metadata),session.user_id);}
async function workforceRows(db,organisationId,staffId){
  const [recruitment,employment,supervisions,catalogue,training,competencies,qualifications,appraisals,absences,hr,documents,events]=await Promise.all([
    db.prepare('SELECT r.*,u.display_name verified_by_name FROM staff_recruitment_checks r LEFT JOIN users u ON u.id=r.verified_by AND u.organisation_id=r.organisation_id WHERE r.organisation_id=? AND r.staff_id=? ORDER BY r.check_type,r.created_at DESC').bind(organisationId,staffId).all(),
    db.prepare('SELECT h.*,u.display_name verified_by_name FROM staff_employment_history h LEFT JOIN users u ON u.id=h.verified_by AND u.organisation_id=h.organisation_id WHERE h.organisation_id=? AND h.staff_id=? ORDER BY COALESCE(h.started_on,\'0000-00-00\') DESC').bind(organisationId,staffId).all(),
    db.prepare(`SELECT s.*,sup.first_name||' '||sup.last_name supervisor_name,mu.display_name manager_signed_name FROM staff_supervisions s LEFT JOIN staff sup ON sup.id=s.supervisor_staff_id AND sup.organisation_id=s.organisation_id LEFT JOIN users mu ON mu.id=s.manager_signed_by AND mu.organisation_id=s.organisation_id WHERE s.organisation_id=? AND s.staff_id=? ORDER BY datetime(s.scheduled_at) DESC`).bind(organisationId,staffId).all(),
    db.prepare('SELECT * FROM staff_training_catalog WHERE organisation_id=? AND active=1 ORDER BY category,name').bind(organisationId).all(),
    db.prepare('SELECT t.*,c.name training_name,c.category,c.requirement_level,c.role_scope_json,c.renewal_months,c.evidence_required,c.critical_for_allocation FROM staff_training_records t JOIN staff_training_catalog c ON c.id=t.training_catalog_id AND c.organisation_id=t.organisation_id WHERE t.organisation_id=? AND t.staff_id=? ORDER BY c.category,c.name').bind(organisationId,staffId).all(),
    db.prepare('SELECT * FROM staff_competencies WHERE organisation_id=? AND staff_id=? ORDER BY category,name').bind(organisationId,staffId).all(),
    db.prepare('SELECT q.*,u.display_name verified_by_name FROM staff_qualifications q LEFT JOIN users u ON u.id=q.verified_by AND u.organisation_id=q.organisation_id WHERE q.organisation_id=? AND q.staff_id=? ORDER BY q.status,q.name').bind(organisationId,staffId).all(),
    db.prepare(`SELECT a.*,m.first_name||' '||m.last_name manager_name,u.display_name manager_signed_name FROM staff_appraisals a LEFT JOIN staff m ON m.id=a.manager_staff_id AND m.organisation_id=a.organisation_id LEFT JOIN users u ON u.id=a.manager_signed_by AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? AND a.staff_id=? ORDER BY datetime(a.scheduled_at) DESC`).bind(organisationId,staffId).all(),
    db.prepare('SELECT * FROM staff_absences WHERE organisation_id=? AND staff_id=? ORDER BY datetime(started_at) DESC').bind(organisationId,staffId).all(),
    db.prepare('SELECT h.*,u.display_name owner_name FROM staff_hr_cases h LEFT JOIN users u ON u.id=h.owner_user_id AND u.organisation_id=h.organisation_id WHERE h.organisation_id=? AND h.staff_id=? ORDER BY datetime(h.opened_at) DESC').bind(organisationId,staffId).all(),
    db.prepare("SELECT id,title,document_type,issue_date,expiry_date,status,sensitive,retention_until,original_file_name,mime_type,size_bytes,notes,created_at FROM staff_documents WHERE organisation_id=? AND staff_id=? AND status<>'archived' ORDER BY created_at DESC").bind(organisationId,staffId).all(),
    db.prepare(`SELECT e.*,u.display_name created_by_name FROM staff_record_events e LEFT JOIN users u ON u.id=e.created_by AND u.organisation_id=e.organisation_id WHERE e.organisation_id=? AND e.staff_id=? ORDER BY e.created_at DESC LIMIT 100`).bind(organisationId,staffId).all()
  ]);
  const map=result=>result.results||[];
  const supervisionRows=map(supervisions).map(row=>({...row,actions:safeJson(row.actions_json,[]),objectives:undefined}));
  const appraisalRows=map(appraisals).map(row=>({...row,objectives:safeJson(row.objectives_json,[])}));
  return {recruitment:map(recruitment),employmentHistory:map(employment),supervisions:supervisionRows,trainingCatalogue:map(catalogue),training:map(training),competencies:map(competencies),qualifications:map(qualifications),appraisals:appraisalRows,absences:map(absences),hrCases:map(hr),documents:map(documents),events:map(events)};
}
async function getStaffWorkforce(db,session,staffId){
  const staffRow=await ensureWorkforceStaff(db,session,staffId);if(!staffRow)return notFound('Staff record');
  const [records,settings,canSupervision,canTraining,canDocuments,canHr]=await Promise.all([workforceRows(db,session.organisation_id,staffId),workforceSettingsRow(db,session.organisation_id),userHasPermission(db,session,'staff.supervision.view'),userHasPermission(db,session,'staff.training.view'),userHasPermission(db,session,'staff.documents.view'),userHasPermission(db,session,'staff.hr.view')]);
  const readiness=calculateStaffReadiness(staffRow,records,settings);
  const visible={recruitment:records.recruitment.filter(row=>!Number(row.restricted)||canHr),employmentHistory:records.employmentHistory,events:records.events.filter(row=>canHr||!['hr','absences'].includes(row.record_type))};
  if(canSupervision)Object.assign(visible,{supervisions:records.supervisions,appraisals:records.appraisals});
  if(canTraining)Object.assign(visible,{trainingCatalogue:records.trainingCatalogue,training:records.training,competencies:records.competencies,qualifications:records.qualifications});
  if(canDocuments)visible.documents=records.documents;
  if(canHr)Object.assign(visible,{absences:records.absences,hrCases:records.hrCases});
  return json({staff:toStaff(staffRow),settings:workforceSettingsPayload(settings),readiness,records:visible,access:{canViewSupervision:canSupervision,canViewTraining:canTraining,canViewDocuments:canDocuments,canManageRecords:await userHasPermission(db,session,'staff.records.manage'),canManageSupervision:await userHasPermission(db,session,'staff.supervision.manage'),canManageTraining:await userHasPermission(db,session,'staff.training.manage'),canManageDocuments:await userHasPermission(db,session,'staff.documents.manage'),canViewHr:canHr,canManageHr:await userHasPermission(db,session,'staff.hr.manage'),self:false}});
}
async function getMyStaffWorkforce(db,session){
  if(!session.staff_id)return json({error:{code:'STAFF_LINK_REQUIRED',message:'Your login is not linked to a staff record. Ask your manager to link it.'}},404);
  const staffRow=await ensureWorkforceStaff(db,session,session.staff_id);if(!staffRow)return notFound('Staff record');
  const [records,settings]=await Promise.all([workforceRows(db,session.organisation_id,session.staff_id),workforceSettingsRow(db,session.organisation_id)]);
  const visible={supervisions:records.supervisions.filter(row=>row.status==='completed'||row.status==='planned').map(({safeguarding_discussion,incidents_discussion,...row})=>row),trainingCatalogue:records.trainingCatalogue,training:records.training,competencies:records.competencies,qualifications:records.qualifications,appraisals:records.appraisals.filter(row=>row.status==='completed'||row.status==='planned'),documents:records.documents.filter(row=>!row.sensitive&&['qualification','training_certificate','professional_registration','employment_contract','supervision_evidence','appraisal_evidence','other'].includes(row.document_type)),events:records.events.filter(row=>!['hr','absence','absences','recruitment'].includes(row.record_type))};
  return json({staff:toStaff(staffRow),settings:workforceSettingsPayload(settings),readiness:calculateStaffReadiness(staffRow,records,settings),records:visible,access:{self:true,canViewSupervision:true,canViewTraining:true,canViewDocuments:true,canManageRecords:false,canManageSupervision:false,canManageTraining:false,canManageDocuments:false,canViewHr:false,canManageHr:false}});
}
async function workforceOverviewDataForSession(db,session){
  const scoped=staffBranchRestricted(session),branch=session.active_branch_id||session.home_branch_id;
  const [staffResult,settings,catalogue,recruitment,employment,supervisions,training,competencies,qualifications,appraisals,documents]=await Promise.all([
    db.prepare(`SELECT * FROM staff WHERE organisation_id=? ${scoped?'AND branch_id=?':''} ORDER BY last_name,first_name`).bind(session.organisation_id,...(scoped?[branch]:[])).all(),workforceSettingsRow(db,session.organisation_id),
    db.prepare('SELECT * FROM staff_training_catalog WHERE organisation_id=? AND active=1').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_recruitment_checks WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_employment_history WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_supervisions WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_training_records WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_competencies WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_qualifications WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare('SELECT * FROM staff_appraisals WHERE organisation_id=?').bind(session.organisation_id).all(),db.prepare("SELECT * FROM staff_documents WHERE organisation_id=? AND status<>'archived'").bind(session.organisation_id).all()
  ]);
  const rows=staffResult.results||[],allowed=new Set(rows.map(row=>row.id)),records={};for(const id of allowed)records[id]={trainingCatalogue:catalogue.results||[],recruitment:[],employmentHistory:[],supervisions:[],training:[],competencies:[],qualifications:[],appraisals:[],documents:[]};
  const assign=(result,key)=>{for(const row of result.results||[])if(allowed.has(row.staff_id))records[row.staff_id][key].push(row);};assign(recruitment,'recruitment');assign(employment,'employmentHistory');assign(supervisions,'supervisions');assign(training,'training');assign(competencies,'competencies');assign(qualifications,'qualifications');assign(appraisals,'appraisals');assign(documents,'documents');
  const overview=calculateWorkforceOverview(rows,records,settings);return {...overview,settings:workforceSettingsPayload(settings)};
}
async function workforceOverview(db,session){return json(await workforceOverviewDataForSession(db,session));}
function workforceRecordTitle(section,input){return clean(input.title||input.name||input.trainingName||input.employerName||input.appraisalType||input.meetingType||input.caseType||input.checkType||section).slice(0,160);}
async function saveStaffWorkforceRecord(request,db,session,staffId,section,recordId=null){
  const staffRow=await ensureWorkforceStaff(db,session,staffId);if(!staffRow)return notFound('Staff record');
  const table=WORKFORCE_TABLES[section];if(!table)return notFound('Workforce section');
  const input=await readJson(request);let existing=null;if(recordId){existing=await db.prepare(`SELECT id FROM ${table} WHERE id=? AND organisation_id=? AND staff_id=?`).bind(recordId,session.organisation_id,staffId).first();if(!existing)return notFound('Workforce record');}
  const id=recordId||crypto.randomUUID(),statements=[];let summary=workforceRecordTitle(section,input),eventType=existing?'updated':'created';
  if(section==='recruitment'){
    const type=clean(input.checkType),status=clean(input.status)||'pending',allowedTypes=['identity','right_to_work','dbs','reference','employment_history','qualification','professional_registration','health_declaration','interview','other'],allowedStatus=['pending','verified','concern','expired','not_required'];if(!allowedTypes.includes(type)||!allowedStatus.includes(status)||!clean(input.title))return json({error:{code:'VALIDATION_ERROR',message:'Choose a check type, title and valid status.'}},400);
    const values=[type,clean(input.title).slice(0,200),status,clean(input.checkedAt)||null,clean(input.expiryDate)||null,clean(input.reference).slice(0,250),status==='verified'?session.user_id:null,clean(input.outcome).slice(0,2000),clean(input.notes).slice(0,5000),input.restricted?1:0];
    statements.push(existing?db.prepare(`UPDATE staff_recruitment_checks SET check_type=?,title=?,status=?,checked_at=?,expiry_date=?,reference=?,verified_by=?,outcome=?,notes=?,restricted=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_recruitment_checks(id,organisation_id,staff_id,check_type,title,status,checked_at,expiry_date,reference,verified_by,outcome,notes,restricted,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=clean(input.title);
  }else if(section==='employment'){
    if(!clean(input.employerName))return json({error:{code:'VALIDATION_ERROR',message:'Enter the employer or organisation name.'}},400);const verified=input.verified?1:0,values=[clean(input.employerName).slice(0,200),clean(input.jobTitle).slice(0,160),clean(input.startedOn)||null,clean(input.endedOn)||null,clean(input.reasonForLeaving).slice(0,1000),clean(input.gapExplanation).slice(0,2000),verified,verified?session.user_id:null,verified?new Date().toISOString():null,clean(input.notes).slice(0,3000)];
    statements.push(existing?db.prepare(`UPDATE staff_employment_history SET employer_name=?,job_title=?,started_on=?,ended_on=?,reason_for_leaving=?,gap_explanation=?,verified=?,verified_by=?,verified_at=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_employment_history(id,organisation_id,staff_id,employer_name,job_title,started_on,ended_on,reason_for_leaving,gap_explanation,verified,verified_by,verified_at,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=clean(input.employerName);
  }else if(section==='supervisions'){
    const type=clean(input.meetingType)||'formal',status=clean(input.status)||'planned',scheduled=clean(input.scheduledAt),allowedTypes=['formal','probation','return_to_work','clinical','competency','wellbeing','ad_hoc'],allowedStatus=['draft','planned','completed','cancelled','missed'];if(!scheduled||!allowedTypes.includes(type)||!allowedStatus.includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid supervision type, status and scheduled date.'}},400);if(status==='completed'&&!clean(input.reflectiveDiscussion)&&!clean(input.performanceSummary))return json({error:{code:'VALIDATION_ERROR',message:'Completed supervision requires a reflective discussion or performance summary.'}},400);
    const completed=status==='completed'?(clean(input.completedAt)||new Date().toISOString()):null,actions=normaliseSupervisionActions(input.actions).map(action=>({...action,completedAt:action.status==='completed'?(action.completedAt||new Date().toISOString()):''})),values=[clean(input.supervisorStaffId)||null,type,status,scheduled,completed,clean(input.location).slice(0,160),input.wellbeingRating?Math.max(1,Math.min(5,Number(input.wellbeingRating))):null,clean(input.agenda).slice(0,5000),clean(input.reflectiveDiscussion).slice(0,10000),clean(input.performanceSummary).slice(0,10000),clean(input.safeguardingDiscussion).slice(0,5000),clean(input.incidentsDiscussion).slice(0,5000),clean(input.trainingDiscussion).slice(0,5000),clean(input.supportRequired).slice(0,5000),clean(input.agreedOutcomes).slice(0,5000),JSON.stringify(actions),clean(input.nextSupervisionDate)||null,status==='completed'?session.user_id:null,status==='completed'?new Date().toISOString():null];
    statements.push(existing?db.prepare(`UPDATE staff_supervisions SET supervisor_staff_id=?,meeting_type=?,status=?,scheduled_at=?,completed_at=?,location=?,wellbeing_rating=?,agenda=?,reflective_discussion=?,performance_summary=?,safeguarding_discussion=?,incidents_discussion=?,training_discussion=?,support_required=?,agreed_outcomes=?,actions_json=?,next_supervision_date=?,manager_signed_by=?,manager_signed_at=?,staff_acknowledged_by=NULL,staff_acknowledged_at=NULL,staff_comments=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_supervisions(id,organisation_id,staff_id,supervisor_staff_id,meeting_type,status,scheduled_at,completed_at,location,wellbeing_rating,agenda,reflective_discussion,performance_summary,safeguarding_discussion,incidents_discussion,training_discussion,support_required,agreed_outcomes,actions_json,next_supervision_date,manager_signed_by,manager_signed_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));if(clean(input.nextSupervisionDate))statements.push(db.prepare('UPDATE staff SET next_supervision_date=? WHERE id=? AND organisation_id=?').bind(clean(input.nextSupervisionDate),staffId,session.organisation_id));summary=`${type.replaceAll('_',' ')} supervision`;
  }else if(section==='training'){
    const catalogId=clean(input.trainingCatalogId),catalog=await db.prepare('SELECT * FROM staff_training_catalog WHERE id=? AND organisation_id=? AND active=1').bind(catalogId,session.organisation_id).first();if(!catalog)return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid training requirement.'}},400);const status=clean(input.status)||'assigned',allowed=['assigned','booked','in_progress','completed','failed','expired','exempt'];if(!allowed.includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid training status.'}},400);let expiry=clean(input.expiryDate)||null;if(!expiry&&status==='completed'&&clean(input.completedDate)&&Number(catalog.renewal_months)){const date=new Date(`${clean(input.completedDate)}T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+Number(catalog.renewal_months));expiry=date.toISOString().slice(0,10);}const values=[catalogId,status,clean(input.assignedAt)||new Date().toISOString(),clean(input.requiredBy)||null,clean(input.bookedFor)||null,clean(input.completedDate)||null,expiry,clean(input.provider).slice(0,200),clean(input.certificateReference).slice(0,250),clean(input.result).slice(0,500),clean(input.assessorName).slice(0,160),input.competencyConfirmed?1:0,clean(input.exemptionReason).slice(0,1000),clean(input.notes).slice(0,5000)];
    statements.push(existing?db.prepare(`UPDATE staff_training_records SET training_catalog_id=?,status=?,assigned_at=?,required_by=?,booked_for=?,completed_date=?,expiry_date=?,provider=?,certificate_reference=?,result=?,assessor_name=?,competency_confirmed=?,exemption_reason=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_training_records(id,organisation_id,staff_id,training_catalog_id,status,assigned_at,required_by,booked_for,completed_date,expiry_date,provider,certificate_reference,result,assessor_name,competency_confirmed,exemption_reason,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id,staff_id,training_catalog_id) DO UPDATE SET status=excluded.status,assigned_at=excluded.assigned_at,required_by=excluded.required_by,booked_for=excluded.booked_for,completed_date=excluded.completed_date,expiry_date=excluded.expiry_date,provider=excluded.provider,certificate_reference=excluded.certificate_reference,result=excluded.result,assessor_name=excluded.assessor_name,competency_confirmed=excluded.competency_confirmed,exemption_reason=excluded.exemption_reason,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=catalog.name;
  }else if(section==='competencies'){
    const name=clean(input.name),status=clean(input.status)||'planned',allowed=['planned','observed','competent','development_required','restricted','expired'];if(!name||!allowed.includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Enter a competency name and valid status.'}},400);const values=[name.slice(0,200),clean(input.category).slice(0,120)||'Care practice',status,input.criticalForAllocation?1:0,clean(input.assessedAt)||null,clean(input.expiryDate)||null,clean(input.assessorName).slice(0,160),clean(input.observation).slice(0,5000),clean(input.outcome).slice(0,3000),clean(input.restrictions).slice(0,3000),clean(input.nextReviewDate)||null];
    statements.push(existing?db.prepare(`UPDATE staff_competencies SET name=?,category=?,status=?,critical_for_allocation=?,assessed_at=?,expiry_date=?,assessor_name=?,observation=?,outcome=?,restrictions=?,next_review_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_competencies(id,organisation_id,staff_id,name,category,status,critical_for_allocation,assessed_at,expiry_date,assessor_name,observation,outcome,restrictions,next_review_date,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=name;
  }else if(section==='qualifications'){
    const name=clean(input.name),status=clean(input.status)||'current',allowed=['studying','current','expired','suspended','archived'];if(!name||!allowed.includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Enter a qualification name and valid status.'}},400);const verified=input.verified?1:0,values=[name.slice(0,200),clean(input.qualificationLevel).slice(0,100),clean(input.awardingBody).slice(0,200),clean(input.registrationNumber).slice(0,160),status,clean(input.issuedDate)||null,clean(input.expiryDate)||null,verified,verified?session.user_id:null,verified?new Date().toISOString():null,clean(input.notes).slice(0,3000)];
    statements.push(existing?db.prepare(`UPDATE staff_qualifications SET name=?,qualification_level=?,awarding_body=?,registration_number=?,status=?,issued_date=?,expiry_date=?,verified=?,verified_by=?,verified_at=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_qualifications(id,organisation_id,staff_id,name,qualification_level,awarding_body,registration_number,status,issued_date,expiry_date,verified,verified_by,verified_at,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=name;
  }else if(section==='appraisals'){
    const type=clean(input.appraisalType)||'annual',status=clean(input.status)||'planned',scheduled=clean(input.scheduledAt),allowedTypes=['annual','probation','development','performance','career'],allowedStatus=['draft','planned','completed','cancelled'];if(!scheduled||!allowedTypes.includes(type)||!allowedStatus.includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid appraisal type, status and date.'}},400);const completed=status==='completed'?(clean(input.completedAt)||new Date().toISOString()):null,objectives=Array.isArray(input.objectives)?input.objectives.slice(0,20):[],values=[clean(input.managerStaffId)||null,type,status,clean(input.periodStart)||null,clean(input.periodEnd)||null,scheduled,completed,input.performanceRating?Math.max(1,Math.min(5,Number(input.performanceRating))):null,clean(input.performanceSummary).slice(0,10000),clean(input.achievements).slice(0,5000),clean(input.strengths).slice(0,5000),JSON.stringify(objectives),clean(input.developmentPlan).slice(0,10000),clean(input.careerAspirations).slice(0,5000),clean(input.staffComments).slice(0,5000),clean(input.nextAppraisalDate)||null,status==='completed'?session.user_id:null,status==='completed'?new Date().toISOString():null];
    statements.push(existing?db.prepare(`UPDATE staff_appraisals SET manager_staff_id=?,appraisal_type=?,status=?,period_start=?,period_end=?,scheduled_at=?,completed_at=?,performance_rating=?,performance_summary=?,achievements=?,strengths=?,objectives_json=?,development_plan=?,career_aspirations=?,staff_comments=?,next_appraisal_date=?,manager_signed_by=?,manager_signed_at=?,staff_acknowledged_by=NULL,staff_acknowledged_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_appraisals(id,organisation_id,staff_id,manager_staff_id,appraisal_type,status,period_start,period_end,scheduled_at,completed_at,performance_rating,performance_summary,achievements,strengths,objectives_json,development_plan,career_aspirations,staff_comments,next_appraisal_date,manager_signed_by,manager_signed_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));if(clean(input.nextAppraisalDate))statements.push(db.prepare('UPDATE staff SET next_appraisal_date=? WHERE id=? AND organisation_id=?').bind(clean(input.nextAppraisalDate),staffId,session.organisation_id));summary=`${type} appraisal`;
  }else if(section==='absences'){
    const type=clean(input.absenceType)||'sickness',status=clean(input.status)||'open',started=clean(input.startedAt),allowedTypes=['sickness','authorised','unpaid','family','bereavement','medical','other'],allowedStatus=['planned','open','closed','cancelled'];if(!started||!allowedTypes.includes(type)||!allowedStatus.includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid absence type, status and start date.'}},400);const values=[type,status,started,clean(input.endedAt)||null,clean(input.reasonSummary).slice(0,2000),input.fitNoteRequired?1:0,input.fitNoteReceived?1:0,input.returnToWorkRequired===false?0:1,clean(input.returnToWorkCompletedAt)||null,clean(input.returnToWorkNotes).slice(0,5000),1];
    statements.push(existing?db.prepare(`UPDATE staff_absences SET absence_type=?,status=?,started_at=?,ended_at=?,reason_summary=?,fit_note_required=?,fit_note_received=?,return_to_work_required=?,return_to_work_completed_at=?,return_to_work_notes=?,restricted=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_absences(id,organisation_id,staff_id,absence_type,status,started_at,ended_at,reason_summary,fit_note_required,fit_note_received,return_to_work_required,return_to_work_completed_at,return_to_work_notes,restricted,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=`${type} absence`;
  }else if(section==='hr'){
    const type=clean(input.caseType),status=clean(input.status)||'open',summaryText=clean(input.summary),allowedTypes=['capability','disciplinary','grievance','safeguarding','conduct','complaint','other'],allowedStatus=['open','investigating','hearing','action_plan','closed','appealed'];if(!allowedTypes.includes(type)||!allowedStatus.includes(status)||!summaryText)return json({error:{code:'VALIDATION_ERROR',message:'Choose a case type, status and enter a factual summary.'}},400);const reference=clean(input.referenceNumber)||`HR-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,values=[reference.slice(0,80),type,status,clean(input.openedAt)||new Date().toISOString(),status==='closed'?(clean(input.closedAt)||new Date().toISOString()):null,summaryText.slice(0,10000),clean(input.actionsTaken).slice(0,10000),clean(input.outcome).slice(0,10000),session.user_id,1];
    statements.push(existing?db.prepare(`UPDATE staff_hr_cases SET reference_number=?,case_type=?,status=?,opened_at=?,closed_at=?,summary=?,actions_taken=?,outcome=?,owner_user_id=?,restricted=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(...values,id,session.organisation_id,staffId):db.prepare(`INSERT INTO staff_hr_cases(id,organisation_id,staff_id,reference_number,case_type,status,opened_at,closed_at,summary,actions_taken,outcome,owner_user_id,restricted,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,...values,session.user_id));summary=`${reference} · ${type}`;
  }
  statements.push(workforceEventStatement(db,session,staffId,eventType,section,id,`${existing?'Updated':'Created'} ${summary}`,{}),auditStatement(db,session.organisation_id,session.user_id,`staff.${section}.${eventType}`,'staff',staffId,{recordId:id}));await db.batch(statements);return json({ok:true,id},existing?200:201);
}
async function archiveStaffWorkforceRecord(db,session,staffId,section,recordId){
  if(!await ensureWorkforceStaff(db,session,staffId))return notFound('Staff record');const table=WORKFORCE_TABLES[section];if(!table)return notFound('Workforce section');const existing=await db.prepare(`SELECT id FROM ${table} WHERE id=? AND organisation_id=? AND staff_id=?`).bind(recordId,session.organisation_id,staffId).first();if(!existing)return notFound('Workforce record');
  const transitions={recruitment:["status='not_required'"],supervisions:["status='cancelled'"],training:["status='exempt'"],qualifications:["status='archived'"],appraisals:["status='cancelled'"],absences:["status='cancelled'"],hr:["status='closed',closed_at=COALESCE(closed_at,CURRENT_TIMESTAMP)"]};if(!transitions[section])return json({error:{code:'RECORD_RETENTION_REQUIRED',message:'This record is part of the retained workforce history. Correct it rather than deleting it.'}},409);
  await db.batch([db.prepare(`UPDATE ${table} SET ${transitions[section][0]},updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(recordId,session.organisation_id,staffId),workforceEventStatement(db,session,staffId,'archived',section,recordId,`Archived ${section} record`,{}),auditStatement(db,session.organisation_id,session.user_id,`staff.${section}.archived`,'staff',staffId,{recordId})]);return json({ok:true});
}
async function acknowledgeStaffRecord(request,db,session,staffId,section,recordId){
  if(!session.staff_id||session.staff_id!==staffId)return forbidden('Only the staff member can acknowledge their own record.');if(!await ensureWorkforceStaff(db,session,staffId))return notFound('Staff record');const table=section==='supervisions'?'staff_supervisions':'staff_appraisals',comments=clean((await readJson(request)).comments).slice(0,5000),existing=await db.prepare(`SELECT id,status FROM ${table} WHERE id=? AND organisation_id=? AND staff_id=?`).bind(recordId,session.organisation_id,staffId).first();if(!existing)return notFound('Staff record');if(existing.status!=='completed')return json({error:{code:'RECORD_NOT_COMPLETE',message:'Only a completed record can be acknowledged.'}},409);
  const commentSql=section==='supervisions'?',staff_comments=?':'';await db.batch([db.prepare(`UPDATE ${table} SET staff_acknowledged_by=?,staff_acknowledged_at=CURRENT_TIMESTAMP${commentSql},updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=?`).bind(session.user_id,...(section==='supervisions'?[comments]:[]),recordId,session.organisation_id,staffId),workforceEventStatement(db,session,staffId,'acknowledged',section,recordId,`Staff member acknowledged ${section.slice(0,-1)} record`,{}),auditStatement(db,session.organisation_id,session.user_id,`staff.${section}.acknowledged`,'staff',staffId,{recordId})]);return json({ok:true});
}
async function uploadStaffDocument(request,env,session,staffId){
  if(!env.CLIENT_FILES)return json({error:{code:'STORAGE_UNAVAILABLE',message:'Private staff document storage is not configured.'}},503);if(!await ensureWorkforceStaff(env.DB,session,staffId))return notFound('Staff record');let form;try{form=await readFormData(request,11*1024*1024);}catch{return json({error:{code:'FILE_TOO_LARGE',message:'The document upload is too large or invalid.'}},413);}const file=form.get('file'),title=clean(form.get('title')),type=clean(form.get('documentType')),allowed=['identity','right_to_work','reference','qualification','training_certificate','professional_registration','employment_contract','fit_note','supervision_evidence','appraisal_evidence','other'];if(!title||!allowed.includes(type))return json({error:{code:'VALIDATION_ERROR',message:'Enter a title and choose a supported staff document type. DBS certificates should be recorded as check metadata, not uploaded.'}},400);if(!file||typeof file.arrayBuffer!=='function'||!Number(file.size))return json({error:{code:'VALIDATION_ERROR',message:'Choose a PDF, JPEG or PNG file.'}},400);if(Number(file.size)>10*1024*1024)return json({error:{code:'FILE_TOO_LARGE',message:'Staff document files must be 10 MB or smaller.'}},413);const buffer=await file.arrayBuffer(),detected=detectedDocumentType(new Uint8Array(buffer));if(!detected)return json({error:{code:'UNSUPPORTED_FILE',message:'Only genuine PDF, JPEG and PNG files are accepted.'}},415);const id=crypto.randomUUID(),originalName=safeDownloadName(file.name),key=`${session.organisation_id}/staff/${staffId}/${id}.${detected.extension}`,sensitive=['identity','right_to_work','fit_note','employment_contract'].includes(type)?1:(clean(form.get('sensitive'))==='true'?1:0);await env.CLIENT_FILES.put(key,buffer,{httpMetadata:{contentType:detected.mime,contentDisposition:`attachment; filename="${originalName}"`},customMetadata:{organisationId:session.organisation_id,staffId,documentId:id,recordClass:'staff'}});try{await env.DB.batch([env.DB.prepare(`INSERT INTO staff_documents(id,organisation_id,staff_id,title,document_type,issue_date,expiry_date,status,sensitive,retention_until,storage_key,original_file_name,mime_type,size_bytes,notes,uploaded_by) VALUES(?,?,?,?,?,?,?,'current',?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,staffId,title.slice(0,200),type,clean(form.get('issueDate'))||null,clean(form.get('expiryDate'))||null,sensitive,clean(form.get('retentionUntil'))||null,key,originalName,detected.mime,Number(file.size),clean(form.get('notes')).slice(0,3000),session.user_id),workforceEventStatement(env.DB,session,staffId,'uploaded','documents',id,`Uploaded ${title}`,{documentType:type}),auditStatement(env.DB,session.organisation_id,session.user_id,'staff.documents.uploaded','staff',staffId,{recordId:id,documentType:type,sizeBytes:Number(file.size)})]);}catch(error){await env.CLIENT_FILES.delete(key);throw error;}return json({ok:true,id},201);
}
async function staffDocumentFile(env,session,staffId,documentId){
  if(!env.CLIENT_FILES)return json({error:{code:'STORAGE_UNAVAILABLE',message:'Private staff document storage is not configured.'}},503);if(!await ensureWorkforceStaff(env.DB,session,staffId))return notFound('Staff record');const self=session.staff_id===staffId;let allowed=self;if(!self)allowed=await userHasPermission(env.DB,session,'staff.documents.view');if(!allowed)return forbidden();const row=await env.DB.prepare("SELECT * FROM staff_documents WHERE id=? AND organisation_id=? AND staff_id=? AND status<>'archived'").bind(documentId,session.organisation_id,staffId).first();if(!row)return notFound('Staff document');const selfDocumentTypes=['qualification','training_certificate','professional_registration','employment_contract','supervision_evidence','appraisal_evidence','other'];if(self&&(Number(row.sensitive)||!selfDocumentTypes.includes(row.document_type)))return forbidden('This document is available to authorised managers only.');const object=await env.CLIENT_FILES.get(row.storage_key);if(!object)return notFound('Staff document file');const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="${safeDownloadName(row.original_file_name||row.title)}"`});object.writeHttpMetadata(headers);headers.set('content-disposition',`attachment; filename="${safeDownloadName(row.original_file_name||row.title)}"`);headers.set('etag',object.httpEtag);await audit(env.DB,session.organisation_id,session.user_id,'staff.documents.downloaded','staff',staffId,{recordId:documentId,self});return new Response(object.body,{headers});
}
async function archiveStaffDocument(db,session,staffId,documentId){if(!await ensureWorkforceStaff(db,session,staffId))return notFound('Staff record');const result=await db.prepare("UPDATE staff_documents SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND staff_id=? AND status<>'archived'").bind(documentId,session.organisation_id,staffId).run();if(!result.meta.changes)return notFound('Staff document');await db.batch([workforceEventStatement(db,session,staffId,'archived','documents',documentId,'Archived staff document',{}),auditStatement(db,session.organisation_id,session.user_id,'staff.documents.archived','staff',staffId,{recordId:documentId})]);return json({ok:true});}


async function ensureClient(db, session, clientId) {
  return db.prepare(`SELECT id,branch_id FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?"AND branch_id=?":""}`).bind(clientId, session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();
}
function carePlanInput(input) {
  const keys=["title","status","effectiveDate","reviewDate","authorName","planType","planSummary","whatMatters","preferences","consentStatus","capacityStatus","decisionMaker","reviewNotes"];
  const v={}; for(const k of keys)v[k]=clean(input[k]);
  v.sections=Array.isArray(input.sections)?input.sections.map((section,index)=>({
    category:clean(section.category), title:clean(section.title)||clean(section.category), enabled:section.enabled===false?0:1,
    assessedNeeds:clean(section.assessedNeeds), desiredOutcomes:clean(section.desiredOutcomes), supportInstructions:clean(section.supportInstructions),
    risksControls:clean(section.risksControls), personalPreferences:clean(section.personalPreferences), reviewDate:clean(section.reviewDate), sortOrder:index
  })).filter(section=>section.category&&section.title):[];
  if(!v.title || !v.reviewDate) return {error:"Enter a care-plan title and review date."};
  if(!["Draft","Active","Under review","Archived"].includes(v.status)) v.status="Draft";
  if(!["Not recorded","Person consented","Representative consented","Best-interest decision","Consent declined"].includes(v.consentStatus)) v.consentStatus="Not recorded";
  if(!["Not assessed","Has capacity","Lacks capacity","Capacity varies","Assessment required"].includes(v.capacityStatus)) v.capacityStatus="Not assessed";
  return {v};
}
async function carePlanSections(db,organisationId,planIds){
  if(!planIds.length)return {};
  const marks=planIds.map(()=>'?').join(',');
  const rows=await db.prepare(`SELECT * FROM care_plan_sections WHERE organisation_id=? AND care_plan_id IN (${marks}) ORDER BY sort_order,title`).bind(organisationId,...planIds).all();
  const grouped={}; for(const row of rows.results||[])(grouped[row.care_plan_id]??=[]).push(toCarePlanSection(row)); return grouped;
}
function sectionStatements(db,session,planId,sections){
  const statements=[db.prepare("DELETE FROM care_plan_sections WHERE care_plan_id=? AND organisation_id=?").bind(planId,session.organisation_id)];
  for(const section of sections)statements.push(db.prepare(`INSERT INTO care_plan_sections(id,organisation_id,care_plan_id,category,title,enabled,assessed_needs,desired_outcomes,support_instructions,risks_controls,personal_preferences,review_date,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,planId,section.category,section.title,section.enabled,section.assessedNeeds,section.desiredOutcomes,section.supportInstructions,section.risksControls,section.personalPreferences,section.reviewDate||null,section.sortOrder));
  return statements;
}
function toCarePlanSection(r){return {id:r.id,category:r.category,title:r.title,enabled:Boolean(r.enabled),assessedNeeds:r.assessed_needs||"",desiredOutcomes:r.desired_outcomes||"",supportInstructions:r.support_instructions||"",risksControls:r.risks_controls||"",personalPreferences:r.personal_preferences||"",reviewDate:r.review_date||"",sortOrder:r.sort_order||0};}
async function listCarePlans(db, session, clientId){
  const client=await ensureClient(db,session,clientId); if(!client) return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);
  const r=await db.prepare("SELECT * FROM care_plans WHERE organisation_id=? AND client_id=? ORDER BY CASE status WHEN 'Active' THEN 0 WHEN 'Under review' THEN 1 WHEN 'Draft' THEN 2 ELSE 3 END, review_date").bind(session.organisation_id,clientId).all();
  const sections=await carePlanSections(db,session.organisation_id,(r.results||[]).map(x=>x.id));
  return json({carePlans:r.results.map(row=>{const plan={...toCarePlan(row),sections:sections[row.id]||[]};return {...plan,readiness:carePlanReadiness(plan,plan.sections)};})});
}

async function listAllCarePlans(db, session, url){
  const status=clean(url.searchParams.get("status"));
  const params=[session.organisation_id]; let where="cp.organisation_id=?";
  if(branchRestricted(session)){where+=" AND cp.branch_id=?";params.push(activeBranch(session));}
  if(status && ["Draft","Active","Under review","Archived"].includes(status)){where+=" AND cp.status=?";params.push(status);}
  const result=await db.prepare(`SELECT cp.*, c.first_name, c.last_name, c.preferred_name FROM care_plans cp JOIN clients c ON c.id=cp.client_id AND c.organisation_id=cp.organisation_id WHERE ${where} ORDER BY CASE cp.status WHEN 'Active' THEN 0 WHEN 'Under review' THEN 1 WHEN 'Draft' THEN 2 ELSE 3 END,cp.review_date,c.last_name COLLATE NOCASE,c.first_name COLLATE NOCASE`).bind(...params).all();
  const sections=await carePlanSections(db,session.organisation_id,(result.results||[]).map(x=>x.id));
  return json({carePlans:result.results.map(row=>{const plan={...toCarePlan(row),sections:sections[row.id]||[],clientName:[row.preferred_name||row.first_name,row.last_name].filter(Boolean).join(" ")};return {...plan,readiness:carePlanReadiness(plan,plan.sections)};})});
}
async function createCarePlan(request,db,session,clientId){
  if(!await ensureClient(db,session,clientId)) return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);
  const parsed=carePlanInput(await readJson(request)); if(parsed.error)return json({error:{code:"VALIDATION_ERROR",message:parsed.error}},400); const v=parsed.v,id=crypto.randomUUID();
  const statements=[db.prepare(`INSERT INTO care_plans (id,organisation_id,branch_id,client_id,title,status,effective_date,review_date,author_name,plan_type,plan_summary,what_matters,preferences,consent_status,capacity_status,decision_maker,review_notes,approval_status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`).bind(id,session.organisation_id,client.branch_id||null,clientId,v.title,v.status==='Active'?'Draft':v.status,v.effectiveDate||null,v.reviewDate,v.authorName,v.planType||'Comprehensive care plan',v.planSummary,v.whatMatters,v.preferences,v.consentStatus,v.capacityStatus,v.decisionMaker,v.reviewNotes,session.user_id),...sectionStatements(db,session,id,v.sections),auditStatement(db,session.organisation_id,session.user_id,"care_plan.created","care_plan",id,{clientId,title:v.title,status:'Draft',sections:v.sections.length})];
  await db.batch(statements); const row=await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first(); return json({carePlan:{...toCarePlan(row),sections:v.sections}},201);
}
async function updateCarePlan(request,db,session,id){
  const existing=await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first(); if(!existing)return json({error:{code:"NOT_FOUND",message:"Care plan not found."}},404);
  const parsed=carePlanInput(await readJson(request)); if(parsed.error)return json({error:{code:"VALIDATION_ERROR",message:parsed.error}},400); const v=parsed.v,next=Number(existing.version||1)+1;
  const oldSections=await carePlanSections(db,session.organisation_id,[id]); const snapshot={...toCarePlan(existing),sections:oldSections[id]||[]};
  const statements=[db.prepare("INSERT INTO care_plan_versions (id,organisation_id,care_plan_id,version,snapshot_json,created_by) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),session.organisation_id,id,existing.version||1,JSON.stringify(snapshot),session.user_id),db.prepare(`UPDATE care_plans SET title=?,status=?,version=?,effective_date=?,review_date=?,author_name=?,plan_type=?,plan_summary=?,what_matters=?,preferences=?,consent_status=?,capacity_status=?,decision_maker=?,review_notes=?,approval_status='pending',approved_by=NULL,approved_at=NULL,submitted_by=?,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(v.title,v.status==='Active'?'Under review':v.status,next,v.effectiveDate||null,v.reviewDate,v.authorName,v.planType||'Comprehensive care plan',v.planSummary,v.whatMatters,v.preferences,v.consentStatus,v.capacityStatus,v.decisionMaker,v.reviewNotes,session.user_id,id,session.organisation_id),...sectionStatements(db,session,id,v.sections),auditStatement(db,session.organisation_id,session.user_id,"care_plan.updated","care_plan",id,{version:next,status:v.status,sections:v.sections.length})];
  await db.batch(statements); return json({carePlan:{...toCarePlan(await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first()),sections:v.sections}});
}
async function archiveCarePlan(db,session,id){const r=await db.prepare("UPDATE care_plans SET status='Archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Care plan not found."}},404);await audit(db,session.organisation_id,session.user_id,"care_plan.archived","care_plan",id,{});return json({ok:true});}
async function carePlanHistory(db,session,id){
  const current=await db.prepare(`SELECT cp.*,u.display_name AS approved_by_name FROM care_plans cp LEFT JOIN users u ON u.id=cp.approved_by AND u.organisation_id=cp.organisation_id WHERE cp.id=? AND cp.organisation_id=?`).bind(id,session.organisation_id).first();
  if(!current)return notFound('Care plan');
  const rows=await db.prepare(`SELECT v.version,v.snapshot_json,v.created_at,u.display_name AS created_by_name FROM care_plan_versions v LEFT JOIN users u ON u.id=v.created_by AND u.organisation_id=v.organisation_id WHERE v.care_plan_id=? AND v.organisation_id=? ORDER BY v.version DESC`).bind(id,session.organisation_id).all();
  return json({current:{version:current.version,status:current.status,approvalStatus:current.approval_status,approvedAt:current.approved_at||'',approvedByName:current.approved_by_name||'',updatedAt:current.updated_at},versions:(rows.results||[]).map(row=>({version:row.version,createdAt:row.created_at,createdByName:row.created_by_name||'',snapshot:safeJson(row.snapshot_json,{})}))});
}
function toCarePlan(r){return {id:r.id,clientId:r.client_id,title:r.title,status:r.status,version:r.version,effectiveDate:r.effective_date||"",reviewDate:r.review_date,authorName:r.author_name||"",planType:r.plan_type||"Comprehensive care plan",planSummary:r.plan_summary||"",whatMatters:r.what_matters||r.personal_details||"",preferences:r.preferences||"",consentStatus:r.consent_status||"Not recorded",capacityStatus:r.capacity_status||"Not assessed",decisionMaker:r.decision_maker||"",reviewNotes:r.review_notes||"",personalDetails:r.personal_details||"",medicalConditions:r.medical_conditions||"",communication:r.communication||"",mobility:r.mobility||"",nutritionHydration:r.nutrition_hydration||"",medicationSupport:r.medication_support||"",continence:r.continence||"",skinIntegrity:r.skin_integrity||"",mentalCapacity:r.mental_capacity||"",risks:r.risks||"",desiredOutcomes:r.desired_outcomes||"",approvalStatus:r.approval_status||"pending",approvedAt:r.approved_at||"",submittedAt:r.submitted_at||"",visitGenerationStatus:r.visit_generation_status||"not_generated",visitsGeneratedAt:r.visits_generated_at||"",createdAt:r.created_at,updatedAt:r.updated_at};}

function riskInput(input){const v={category:clean(input.category)||"General Risk",title:clean(input.title),severity:clean(input.severity)||"Medium",likelihood:clean(input.likelihood)||"Possible",controls:clean(input.controls),actions:clean(input.actions),status:clean(input.status)||"Active",reviewDate:clean(input.reviewDate)};if(!v.title||!v.reviewDate)return {error:"Enter a risk title and review date."};return {v};}
async function listRisks(db,session,clientId){if(!await ensureClient(db,session,clientId))return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);const r=await db.prepare("SELECT * FROM risk_assessments WHERE organisation_id=? AND client_id=? ORDER BY CASE severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, review_date").bind(session.organisation_id,clientId).all();return json({risks:r.results.map(toRisk)});}
async function createRisk(request,db,session,clientId){const client=await ensureClient(db,session,clientId);if(!client)return notFound('Client');const p=riskInput(await readJson(request));if(p.error)return json({error:{code:"VALIDATION_ERROR",message:p.error}},400);const v=p.v,id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO risk_assessments (id,organisation_id,branch_id,client_id,category,title,severity,likelihood,controls,actions,status,review_date,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,client.branch_id||null,clientId,v.category,v.title,v.severity,v.likelihood,v.controls,v.actions,v.status,v.reviewDate,session.user_id),auditStatement(db,session.organisation_id,session.user_id,"risk.created","risk",id,{clientId,title:v.title,severity:v.severity})]);return json({risk:toRisk(await db.prepare("SELECT * FROM risk_assessments WHERE id=?").bind(id).first())},201);}
async function updateRisk(request,db,session,id){const p=riskInput(await readJson(request));if(p.error)return json({error:{code:"VALIDATION_ERROR",message:p.error}},400);const v=p.v,r=await db.prepare("UPDATE risk_assessments SET category=?,title=?,severity=?,likelihood=?,controls=?,actions=?,status=?,review_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(v.category,v.title,v.severity,v.likelihood,v.controls,v.actions,v.status,v.reviewDate,id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Risk assessment not found."}},404);await audit(db,session.organisation_id,session.user_id,"risk.updated","risk",id,{severity:v.severity,status:v.status});return json({risk:toRisk(await db.prepare("SELECT * FROM risk_assessments WHERE id=?").bind(id).first())});}
function toRisk(r){return {id:r.id,clientId:r.client_id,category:r.category,title:r.title,severity:r.severity,likelihood:r.likelihood,controls:r.controls||"",actions:r.actions||"",status:r.status,reviewDate:r.review_date,createdAt:r.created_at,updatedAt:r.updated_at};}

function documentInput(input){const v={name:clean(input.name),documentType:clean(input.documentType)||"Other",documentDate:clean(input.documentDate),reviewDate:clean(input.reviewDate),referenceUrl:clean(input.referenceUrl),notes:clean(input.notes),status:clean(input.status)||"Current"};if(!v.name)return {error:"Enter a document name."};if(v.referenceUrl){try{if(new URL(v.referenceUrl).protocol!=='https:')throw new Error('protocol');}catch{return {error:'Document links must use a valid secure https address.'};}}return {v};}
async function listDocuments(db,session,clientId){if(!await ensureClient(db,session,clientId))return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);const r=await db.prepare("SELECT * FROM client_documents WHERE organisation_id=? AND client_id=? ORDER BY created_at DESC").bind(session.organisation_id,clientId).all();return json({documents:r.results.map(toDocument)});}
async function createDocument(request,db,session,clientId){const client=await ensureClient(db,session,clientId);if(!client)return notFound('Client');const p=documentInput(await readJson(request));if(p.error)return json({error:{code:"VALIDATION_ERROR",message:p.error}},400);const v=p.v,id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO client_documents (id,organisation_id,branch_id,client_id,name,document_type,document_date,review_date,reference_url,notes,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,client.branch_id||null,clientId,v.name,v.documentType,v.documentDate||null,v.reviewDate||null,v.referenceUrl,v.notes,v.status,session.user_id),auditStatement(db,session.organisation_id,session.user_id,"document.added","document",id,{clientId,name:v.name,type:v.documentType})]);return json({document:toDocument(await db.prepare("SELECT * FROM client_documents WHERE id=?").bind(id).first())},201);}
function detectedDocumentType(bytes){
  if(bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d)return {mime:'application/pdf',extension:'pdf'};
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {mime:'image/jpeg',extension:'jpg'};
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return {mime:'image/png',extension:'png'};
  return null;
}
function safeDownloadName(value){return clean(value).replace(/[\r\n"]/g,'').slice(0,200)||'document';}
async function uploadDocument(request,env,session,clientId){
  if(!env.CLIENT_FILES)return json({error:{code:'STORAGE_UNAVAILABLE',message:'Private document storage is not configured.'}},503);
  const client=await ensureClient(env.DB,session,clientId);if(!client)return notFound('Client');
  let form;try{form=await readFormData(request,11*1024*1024);}catch{return json({error:{code:'FILE_TOO_LARGE',message:'The document upload is too large or invalid.'}},413);}
  const file=form.get('file'),input=Object.fromEntries([...form.entries()].filter(([key])=>key!=='file')),p=documentInput(input);
  if(p.error)return json({error:{code:'VALIDATION_ERROR',message:p.error}},400);
  if(!file||typeof file.arrayBuffer!=='function'||!Number(file.size))return json({error:{code:'VALIDATION_ERROR',message:'Choose a PDF, JPEG or PNG file.'}},400);
  if(Number(file.size)>10*1024*1024)return json({error:{code:'FILE_TOO_LARGE',message:'Document files must be 10 MB or smaller.'}},413);
  const buffer=await file.arrayBuffer(),detected=detectedDocumentType(new Uint8Array(buffer));
  if(!detected)return json({error:{code:'UNSUPPORTED_FILE',message:'Only genuine PDF, JPEG and PNG files are accepted.'}},415);
  const v=p.v,id=crypto.randomUUID(),originalName=safeDownloadName(file.name),key=`${session.organisation_id}/${clientId}/${id}.${detected.extension}`;
  await env.CLIENT_FILES.put(key,buffer,{httpMetadata:{contentType:detected.mime,contentDisposition:`attachment; filename="${originalName}"`},customMetadata:{organisationId:session.organisation_id,clientId,documentId:id}});
  try{
    await env.DB.batch([env.DB.prepare(`INSERT INTO client_documents(id,organisation_id,branch_id,client_id,name,document_type,document_date,review_date,reference_url,notes,status,created_by,storage_key,original_file_name,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,client.branch_id||null,clientId,v.name,v.documentType,v.documentDate||null,v.reviewDate||null,v.referenceUrl,v.notes,v.status,session.user_id,key,originalName,detected.mime,Number(file.size)),auditStatement(env.DB,session.organisation_id,session.user_id,'document.uploaded','document',id,{clientId,name:v.name,type:v.documentType,mimeType:detected.mime,sizeBytes:Number(file.size)})]);
  }catch(error){await env.CLIENT_FILES.delete(key);throw error;}
  return json({document:toDocument(await env.DB.prepare('SELECT * FROM client_documents WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first())},201);
}
async function documentFile(env,session,id){
  if(!env.CLIENT_FILES)return json({error:{code:'STORAGE_UNAVAILABLE',message:'Private document storage is not configured.'}},503);
  let row;
  if(session.access_level==='family')row=await env.DB.prepare(`SELECT d.* FROM client_documents d JOIN family_document_shares s ON s.document_id=d.id AND s.organisation_id=d.organisation_id AND s.status='active' JOIN family_client_access f ON f.id=s.access_id AND f.organisation_id=s.organisation_id WHERE d.id=? AND d.organisation_id=? AND d.status!='Archived' AND f.user_id=? AND f.status='active' AND f.can_view_documents=1 LIMIT 1`).bind(id,session.organisation_id,session.user_id).first();
  else {if(!await userHasPermission(env.DB,session,'documents.view'))return forbidden();row=await env.DB.prepare(`SELECT * FROM client_documents WHERE id=? AND organisation_id=? AND status!='Archived' LIMIT 1`).bind(id,session.organisation_id).first();}
  if(!row?.storage_key)return notFound('Document file');
  const object=await env.CLIENT_FILES.get(row.storage_key);if(!object)return notFound('Document file');
  const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':`attachment; filename="${safeDownloadName(row.original_file_name||row.name)}"`});
  object.writeHttpMetadata(headers);headers.set('content-disposition',`attachment; filename="${safeDownloadName(row.original_file_name||row.name)}"`);headers.set('etag',object.httpEtag);
  await audit(env.DB,session.organisation_id,session.user_id,'document.downloaded','document',id,{familyAccess:session.access_level==='family'});
  return new Response(object.body,{headers});
}
async function archiveDocument(db,session,id){const r=await db.prepare("UPDATE client_documents SET status='Archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Document not found."}},404);await audit(db,session.organisation_id,session.user_id,"document.archived","document",id,{});return json({ok:true});}
function toDocument(r){return {id:r.id,clientId:r.client_id,name:r.name,documentType:r.document_type,documentDate:r.document_date||"",reviewDate:r.review_date||"",referenceUrl:r.reference_url||"",storedFile:Boolean(r.storage_key),originalFileName:r.original_file_name||"",mimeType:r.mime_type||"",sizeBytes:Number(r.size_bytes)||0,notes:r.notes||"",status:r.status,createdAt:r.created_at};}

async function listUsers(db, session) {
  const scoped=branchRestricted(session);
  const result = await db.prepare(`SELECT u.id,u.email,u.display_name,u.role,u.access_level,u.home_branch_id,u.status,u.must_change_password,u.last_login_at,u.created_at,ucr.role_id AS custom_role_id,cr.name AS custom_role_name FROM users u LEFT JOIN user_custom_roles ucr ON ucr.user_id=u.id AND ucr.organisation_id=u.organisation_id LEFT JOIN custom_roles cr ON cr.id=ucr.role_id WHERE u.organisation_id=? ${scoped?'AND u.home_branch_id=?':''} ORDER BY u.display_name COLLATE NOCASE`).bind(session.organisation_id,...(scoped?[activeBranch(session)]:[])).all();
  return json({ users: result.results.map(toUser) });
}

async function customRoleAssignmentAllowed(db,session,roleId){
  if(!roleId)return true;
  const role=await db.prepare('SELECT id FROM custom_roles WHERE id=? AND organisation_id=? AND is_active=1').bind(roleId,session.organisation_id).first();
  if(!role)return false;
  const rows=await db.prepare('SELECT permission_key FROM custom_role_permissions WHERE role_id=?').bind(roleId).all();
  for(const row of rows.results||[])if(!await mayGrantPermission(db,session,row.permission_key))return false;
  return true;
}

async function createUser(request, env, session) {
  const db=env.DB;
  if (!await userHasPermission(db, session, "security.users.manage")) return forbidden();
  const input = await readJson(request);
  const email = clean(input.email).toLowerCase();
  const name = clean(input.displayName);
  const accessLevel = clean(input.accessLevel || input.role);
  const role = legacyRole(accessLevel);
  const branchId = branchRestricted(session)?activeBranch(session):(clean(input.branchId)||null);
  const customRoleId = clean(input.customRoleId) || null;
  const password = String(input.temporaryPassword || "");
  if (!email || !name || !allowedAccessLevels().includes(accessLevel) || !strongTemporaryPassword(password)) return json({ error: { code: "VALIDATION_ERROR", message: "Enter a name, valid email, role and temporary password of at least 12 characters with upper-case, lower-case and a number." } }, 400);
  if(!canAssignStandardRole(session.access_level||session.role,accessLevel))return forbidden('You cannot assign that access level.');
  if(!await customRoleAssignmentAllowed(db,session,customRoleId))return forbidden('You cannot assign that custom role.');
  const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;
  const secured = await hashPassword(password);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id,organisation_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?, 'active',1)").bind(id, session.organisation_id, email, name, role, accessLevel, branchId, secured.hash, secured.salt, PASSWORD_ITERATIONS),
      ...(customRoleId ? [db.prepare("INSERT INTO user_custom_roles(user_id,role_id,organisation_id,branch_id,assigned_by) SELECT ?,id,?,?,? FROM custom_roles WHERE id=? AND organisation_id=? AND is_active=1").bind(id,session.organisation_id,branchId,session.user_id,customRoleId,session.organisation_id)] : []),
      auditStatement(db, session.organisation_id, session.user_id, "user.created", "user", id, { email, role, accessLevel, branchId, customRoleId })
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: { code: "EMAIL_EXISTS", message: "A user with that email already exists." } }, 409);
    throw error;
  }
  const emailDelivery=await sendCareAccountEmail(env,session,{templateKey:'account_invitation',sourceEventId:`care-user:${id}:created`,userId:id,recipientEmail:email,recipientName:name,accessLabel:accessLevel.replaceAll('_',' '),temporaryPassword:password});
  return json({ user: { id, email, displayName: name, role, accessLevel, branchId, status: "active", mustChangePassword: true },emailDelivery }, 201);
}

async function updateUser(request, env, session, id) {
  const db=env.DB;
  if (!await userHasPermission(db, session, "security.users.manage")) return forbidden();
  if (id === session.user_id) return json({ error: { code: "SELF_EDIT_BLOCKED", message: "Use the password and profile controls for your own account." } }, 400);
  const input = await readJson(request);
  const name = clean(input.displayName);
  const accessLevel = clean(input.accessLevel || input.role);
  const role = legacyRole(accessLevel);
  const branchId = branchRestricted(session)?activeBranch(session):(clean(input.branchId)||null);
  const status = clean(input.status);
  const customRoleId = clean(input.customRoleId) || null;
  if (!name || !allowedAccessLevels().includes(accessLevel) || !["active", "disabled"].includes(status)) return json({ error: { code: "VALIDATION_ERROR", message: "Enter a name, valid access level and status." } }, 400);
  const existing=await db.prepare('SELECT id,status,role,access_level,home_branch_id FROM users WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();
  if(!existing)return notFound('User');
  if(branchRestricted(session)&&existing.home_branch_id!==activeBranch(session))return forbidden();
  if(!mayManageUser(session,existing)||!canAssignStandardRole(session.access_level||session.role,accessLevel))return forbidden('You cannot change this account or assign that access level.');
  if(!await customRoleAssignmentAllowed(db,session,customRoleId))return forbidden('You cannot assign that custom role.');
  if(existing.access_level==='organisation_owner'&&(accessLevel!=='organisation_owner'||status==='disabled')){
    const owners=await db.prepare("SELECT COUNT(*) total FROM users WHERE organisation_id=? AND access_level='organisation_owner' AND status='active'").bind(session.organisation_id).first();
    if(Number(owners?.total||0)<=1)return json({error:{code:'LAST_OWNER_REQUIRED',message:'Add another active organisation owner before disabling or changing this account.'}},409);
  }
  if(status==='active'&&existing.status!=='active'){const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;}
  const statements = [db.prepare("UPDATE users SET display_name=?,role=?,access_level=?,home_branch_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name, role, accessLevel, branchId, status, id, session.organisation_id), db.prepare("DELETE FROM user_custom_roles WHERE user_id=? AND organisation_id=?").bind(id,session.organisation_id)];
  if(customRoleId) statements.push(db.prepare("INSERT INTO user_custom_roles(user_id,role_id,organisation_id,branch_id,assigned_by) SELECT ?,id,?,?,? FROM custom_roles WHERE id=? AND organisation_id=? AND is_active=1").bind(id,session.organisation_id,branchId,session.user_id,customRoleId,session.organisation_id));
  statements.push(auditStatement(db, session.organisation_id, session.user_id, "user.updated", "user", id, { role, accessLevel, branchId, customRoleId, status }));
  await db.batch(statements);
  if (status === "disabled") await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  return json({ ok: true });
}

async function updateOrganisation(request, db, session) {
  const input = await readJson(request), name = clean(input.name);
  if (name.length < 2) return json({ error: { code: "VALIDATION_ERROR", message: "Enter an organisation name." } }, 400);
  await db.batch([
    db.prepare("UPDATE organisations SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, session.organisation_id),
    auditStatement(db, session.organisation_id, session.user_id, "organisation.updated", "organisation", session.organisation_id, { name })
  ]);
  return json({ organisation: { id: session.organisation_id, name } });
}

async function listAudit(db, session, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const result = await db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail_json,a.created_at,u.display_name AS user_name,u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(session.organisation_id, limit).all();
  return json({ events: result.results });
}

function developmentStatus(env, session) {
  return json({ database: { connected: Boolean(env.DB), binding: "DB" }, authentication: { mode: "D1 sessions", cookie: SESSION_COOKIE }, user: publicUser(session), organisation: { id: session.organisation_id, name: session.organisation_name }, deployment: { version: VERSION, checkedAt: new Date().toISOString() } });
}

function allowedAccessLevels(){return ["organisation_owner","organisation_admin","deputy_manager","branch_manager","office_staff","senior_carer","carer","auditor","family"]; }
function legacyRole(level){return ({organisation_owner:"owner",organisation_admin:"manager",deputy_manager:"manager",branch_manager:"manager",office_staff:"manager",senior_carer:"carer",carer:"carer",auditor:"auditor",family:"auditor"})[level]||"auditor";}
function forbidden(message = "Your account does not have permission to perform this action.") { return json({ error: { code: "FORBIDDEN", message } }, 403); }
async function permitted(db, session, permission, action) {
  if (!await userHasPermission(db, session, permission)) return forbidden();
  return action();
}
function unauthorised(message = "Sign in to continue.") { return json({ error: { code: "UNAUTHORISED", message } }, 401, { "set-cookie": expiredSessionCookie() }); }
function databaseRequired(message = "The D1 database binding named DB is not configured.") { return json({ error: { code: "DATABASE_NOT_CONFIGURED", message } }, 503); }
function methodNotAllowed(allow) { return json({ error: { code: "METHOD_NOT_ALLOWED", message: "This method is not allowed." } }, 405, { allow: allow.join(", ") }); }
function publicUser(row) { return { id: row.user_id || row.id, staffId: row.staff_id || null, organisationId: row.organisation_id, organisationName: row.organisation_name, branchId: row.active_branch_id || row.home_branch_id || null, branchName: row.branch_name || null, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, isPlatformUser: Boolean(row.is_platform_user), supportMode: Boolean(row.support_mode), supportOriginOrganisationId: row.support_origin_organisation_id || null, supportStartedAt: row.support_started_at || null, supportReason: row.support_reason || null, supportAccessMode: row.support_access_mode || null, subscriptionAccess: row.subscription_access || undefined, mustChangePassword: Boolean(row.must_change_password) }; }
function toUser(row) { return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, branchId: row.home_branch_id || null, customRoleId: row.custom_role_id || null, customRoleName: row.custom_role_name || null, status: row.status, mustChangePassword: Boolean(row.must_change_password), lastLoginAt: row.last_login_at, createdAt: row.created_at }; }
function clean(value) { return String(value ?? "").trim(); }
function databaseTimestampMs(value) { const text=clean(value);return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)?`${text.replace(' ','T')}Z`:text).getTime(); }
async function readBytes(request, maxBytes = 262_144) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("request body limit exceeded");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks=[];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel("request body limit exceeded"); throw new Error("request body limit exceeded"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
async function readText(request, maxBytes = 262_144) {
  return new TextDecoder().decode(await readBytes(request,maxBytes));
}
async function readFormData(request,maxBytes){
  const contentType=request.headers.get('content-type')||'';
  if(!contentType)throw new Error('content type required');
  return new Response(await readBytes(request,maxBytes),{headers:{'content-type':contentType}}).formData();
}
async function readJson(request, maxBytes = 262_144) {
  try {
    const value = JSON.parse(await readText(request, maxBytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
async function audit(db, organisationId, userId, action, entityType, entityId, detail) { await auditStatement(db, organisationId, userId, action, entityType, entityId, detail).run(); }
function auditStatement(db, organisationId, userId, action, entityType, entityId, detail) { return db.prepare("INSERT INTO audit_log (id,organisation_id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), organisationId, userId || null, action, entityType, entityId || null, JSON.stringify(detail || {})); }
async function sendCareAccountEmail(env,session,details){
  const result=await requestPlatformTransactionalEmail(env,{...details,organisationId:session.organisation_id});
  await auditStatement(env.DB,session.organisation_id,session.user_id,`email.${clean(details.templateKey)}.${clean(result.status)||'failed'}`,'user',details.userId||null,{recipientEmail:clean(details.recipientEmail).toLowerCase(),sourceEventId:clean(details.sourceEventId),status:result.status,error:result.error||null}).run();
  return {status:result.status||'failed',delivery:result.delivery||null,error:result.error||null};
}
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function cookieValue(request, name) { const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return match ? decodeURIComponent(match[1]) : ""; }
function sessionCookie(token, expires) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`; }
function expiredSessionCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
async function hashPassword(password) { const salt = crypto.getRandomValues(new Uint8Array(16)); const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS); return { salt: base64(salt), hash: base64(hash) }; }
async function verifyPassword(password, saltBase64, expectedBase64, iterations) { const actual = await derivePassword(password, fromBase64(saltBase64), Math.min(Number(iterations) || PASSWORD_ITERATIONS, PASSWORD_ITERATIONS)); return timingSafeEqual(actual, fromBase64(expectedBase64)); }
async function derivePassword(password, salt, iterations) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256); return new Uint8Array(bits); }
async function sha256Base64(value) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return base64(new Uint8Array(digest)); }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
function base64(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function fromBase64(value) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
function json(payload, status = 200, headers = {}) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }); }




async function ensureOrganisationClient(db,session,clientId){return db.prepare(`SELECT id,first_name,last_name,branch_id FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?'AND branch_id=?':''} AND status<>'Archived'`).bind(clientId,session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();}
async function listMedication(db,session,url){
  const clientId=clean(url.searchParams.get('clientId')); if(!clientId)return json({error:{code:'VALIDATION_ERROR',message:'Choose a client.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404);
  const [meds,mar,stock]=await Promise.all([
    db.prepare(`SELECT m.*,u.display_name AS created_by_name FROM medications m LEFT JOIN users u ON u.id=m.created_by AND u.organisation_id=m.organisation_id WHERE m.organisation_id=? AND m.client_id=? ORDER BY CASE m.status WHEN 'active' THEN 0 ELSE 1 END,m.name`).bind(session.organisation_id,clientId).all(),
    db.prepare(`SELECT a.*,m.name AS medication_name,m.strength,m.dose,m.is_prn,u.display_name AS recorded_by_name FROM medication_administrations a JOIN medications m ON m.id=a.medication_id AND m.organisation_id=a.organisation_id LEFT JOIN users u ON u.id=a.recorded_by AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? AND a.client_id=? ORDER BY a.administered_at DESC LIMIT 250`).bind(session.organisation_id,clientId).all(),
    db.prepare(`SELECT t.*,m.name AS medication_name,u.display_name AS recorded_by_name FROM medication_stock_transactions t JOIN medications m ON m.id=t.medication_id AND m.organisation_id=t.organisation_id LEFT JOIN users u ON u.id=t.recorded_by AND u.organisation_id=t.organisation_id WHERE t.organisation_id=? AND t.client_id=? ORDER BY t.created_at DESC LIMIT 250`).bind(session.organisation_id,clientId).all()
  ]);
  return json({medications:(meds.results||[]).map(x=>({...x,scheduledTimes:safeJson(x.scheduled_times_json,[])})),administrations:mar.results||[],stockTransactions:stock.results||[]});
}
async function saveMedication(request,db,session){
  const i=await readJson(request),clientId=clean(i.clientId),name=clean(i.name),dose=clean(i.dose),validation=validateMedicationProfile(i); if(!clientId||validation)return json({error:{code:'VALIDATION_ERROR',message:!clientId?'Choose a client.':validation}},400);
  if(i.controlledDrug&&(!clean(i.prescriberName)||!clean(i.authorisationReference)))return json({error:{code:'VALIDATION_ERROR',message:'Controlled medicines require the prescriber and prescription or authorisation reference.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404);
  const id=clean(i.id)||crypto.randomUUID(),times=Array.isArray(i.scheduledTimes)?i.scheduledTimes.map(clean).filter(Boolean):clean(i.scheduledTimes).split(',').map(x=>x.trim()).filter(Boolean);
  const status=clean(i.status)||'active',discontinued=status==='discontinued';
  const fields=[name,clean(i.strength),clean(i.form),clean(i.route),dose,clean(i.instructions),clean(i.frequency),JSON.stringify([...new Set(times)].sort()),clean(i.startDate)||null,clean(i.endDate)||null,i.isPrn?1:0,clean(i.prnProtocol),nullableNumber(i.minIntervalMinutes),clean(i.maxDose24h),nullableNumber(i.stockQuantity),clean(i.stockUnit),nullableNumber(i.lowStockThreshold)??5,status,discontinued?clean(i.discontinuedReason):null,discontinued?new Date().toISOString():null];
  if(clean(i.id)){
    const existing=await db.prepare('SELECT id,client_id FROM medications WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();
    if(!existing)return notFound('Medication');
    if(existing.client_id!==clientId)return json({error:{code:'VALIDATION_ERROR',message:'A medication cannot be moved to another client.'}},400);
    await db.prepare(`UPDATE medications SET name=?,strength=?,form=?,route=?,dose=?,instructions=?,frequency=?,scheduled_times_json=?,start_date=?,end_date=?,is_prn=?,prn_protocol=?,min_interval_minutes=?,max_dose_24h=?,stock_unit=?,low_stock_threshold=?,status=?,discontinued_reason=?,discontinued_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(...fields.slice(0,14),...fields.slice(15),id,session.organisation_id).run();
  }else{
    await db.prepare(`INSERT INTO medications(id,organisation_id,client_id,name,strength,form,route,dose,instructions,frequency,scheduled_times_json,start_date,end_date,is_prn,prn_protocol,min_interval_minutes,max_dose_24h,stock_quantity,stock_unit,low_stock_threshold,status,discontinued_reason,discontinued_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clientId,...fields,session.user_id).run();
  }
  await db.prepare(`UPDATE medications SET prescriber_name=?,pharmacy_name=?,authorisation_reference=?,controlled_drug=?,requires_witness=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.prescriberName),clean(i.pharmacyName),clean(i.authorisationReference),i.controlledDrug?1:0,(i.controlledDrug||i.requiresWitness)?1:0,id,session.organisation_id).run();
  await audit(db,session.organisation_id,session.user_id,'medication.saved','medication',id,{clientId,name,status}); return json({ok:true,id},201);
}
function localDateString(value){const d=value?new Date(value):new Date();return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
async function medicationWitness(db,session,med,input){
  const outcome=clean(input.outcome);if(!Number(med.requires_witness)&&!Number(med.controlled_drug))return {userId:null,name:''};
  if(!['administered','prompted'].includes(outcome))return {userId:null,name:''};
  const email=clean(input.witnessEmail).toLowerCase(),password=String(input.witnessPassword||'');
  if(!email||!password)return {error:'A second authorised user must witness this controlled or witness-required administration.'};
  const witness=await db.prepare(`SELECT u.*,c.branch_id AS client_branch_id FROM users u JOIN clients c ON c.id=? AND c.organisation_id=u.organisation_id WHERE lower(u.email)=lower(?) AND u.organisation_id=? AND u.status='active' LIMIT 1`).bind(med.client_id||med.med_client_id,email,session.organisation_id).first();
  if(!witness||witness.id===session.user_id||!witness.password_hash||!await verifyPassword(password,witness.password_salt,witness.password_hash,witness.password_iterations||PASSWORD_ITERATIONS))return {error:'The witness credentials are invalid or belong to the recording user.'};
  if(witness.client_branch_id&&witness.home_branch_id&&witness.client_branch_id!==witness.home_branch_id&&!['organisation_owner','organisation_admin'].includes(witness.access_level))return {error:'The witness is not authorised for this client branch.'};
  const witnessSession={...witness,user_id:witness.id,active_branch_id:witness.home_branch_id,is_platform_user:0};
  if(!await userHasPermission(db,witnessSession,'medication.administer'))return {error:'The witness does not have permission to administer medication.'};
  return {userId:witness.id,name:witness.display_name||witness.email};
}
async function administerMedication(request,db,session,id){
  const med=await db.prepare('SELECT * FROM medications WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first(); if(!med)return json({error:{code:'NOT_FOUND',message:'Medication not found.'}},404);
  const i=await readJson(request),outcome=clean(i.outcome),validation=validateAdministration(i,med);if(validation)return json({error:{code:'VALIDATION_ERROR',message:validation}},400);
  const witness=await medicationWitness(db,session,med,i);if(witness.error)return json({error:{code:'WITNESS_REQUIRED',message:witness.error}},409);
  const administeredAt=new Date(clean(i.administeredAt)||Date.now()).toISOString(),scheduledAt=clean(i.scheduledAt)||null;
  if(scheduledAt&&Number.isNaN(new Date(scheduledAt).getTime()))return json({error:{code:'VALIDATION_ERROR',message:'The scheduled dose time is invalid.'}},400);
  if(med.is_prn&&['administered','prompted'].includes(outcome)&&Number(med.min_interval_minutes)>0){
    const previous=await db.prepare(`SELECT administered_at FROM medication_administrations WHERE organisation_id=? AND medication_id=? AND outcome IN ('administered','prompted') AND is_void=0 ORDER BY datetime(administered_at) DESC LIMIT 1`).bind(session.organisation_id,id).first();
    if(previous&&new Date(administeredAt).getTime()-new Date(previous.administered_at).getTime()<Number(med.min_interval_minutes)*60000)return json({error:{code:'PRN_INTERVAL',message:`The PRN minimum interval is ${med.min_interval_minutes} minutes. Check the previous administration before continuing.`}},409);
  }
  const stockUsed=Math.max(0,Number(i.stockUsed)||0),stockChange=['administered','prompted'].includes(outcome)?-stockUsed:0,adminId=crypto.randomUUID();
  const balance=med.stock_quantity===null?null:Number(med.stock_quantity)+stockChange;
  const statements=[
    db.prepare(`INSERT INTO medication_administrations(id,organisation_id,medication_id,client_id,visit_id,scheduled_at,scheduled_date,administered_at,outcome,dose_given,reason,notes,stock_change,prn_reason,prn_effectiveness,effectiveness_reviewed_at,recorded_by,witness_user_id,witness_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(adminId,session.organisation_id,id,med.client_id,clean(i.visitId)||null,scheduledAt,scheduledAt?localDateString(scheduledAt):localDateString(administeredAt),administeredAt,outcome,clean(i.doseGiven)||med.dose,clean(i.reason),clean(i.notes),stockChange,clean(i.prnReason),clean(i.prnEffectiveness),clean(i.prnEffectiveness)?new Date().toISOString():null,session.user_id,witness.userId,witness.name),
    db.prepare(`UPDATE medications SET stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL ELSE stock_quantity+? END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(stockChange,id,session.organisation_id),
    auditStatement(db,session.organisation_id,session.user_id,'medication.administered','medication_administration',adminId,{medicationId:id,outcome,clientId:med.client_id,scheduledAt})
  ];
  if(stockChange)statements.push(db.prepare(`INSERT INTO medication_stock_transactions(id,organisation_id,medication_id,client_id,transaction_type,quantity,balance_after,reason,administration_id,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,id,med.client_id,'administration',stockChange,balance,`eMAR: ${outcome}`,adminId,session.user_id));
  if(['refused','omitted','unavailable','missed'].includes(outcome))statements.push(db.prepare(`INSERT INTO operations_tasks(id,organisation_id,branch_id,client_id,title,description,category,priority,status,due_at,created_by) VALUES(?,?,(SELECT branch_id FROM clients WHERE id=? AND organisation_id=?),?,?,?,'Medication','high','open',?,?)`).bind(crypto.randomUUID(),session.organisation_id,med.client_id,session.organisation_id,med.client_id,`${med.name}: ${outcome}`,clean(i.reason)||`Follow up the ${outcome} eMAR outcome.`,new Date().toISOString(),session.user_id));
  if(balance!==null&&balance<=Number(med.low_stock_threshold??5))statements.push(db.prepare(`INSERT INTO operations_tasks(id,organisation_id,branch_id,client_id,title,description,category,priority,status,due_at,created_by) SELECT ?,(?),c.branch_id,c.id,?,?,'Medication','high','open',?,? FROM clients c WHERE c.id=? AND c.organisation_id=? AND NOT EXISTS (SELECT 1 FROM operations_tasks WHERE organisation_id=? AND client_id=? AND category='Medication' AND status IN ('open','escalated') AND title=?)`).bind(crypto.randomUUID(),session.organisation_id,`Low stock: ${med.name}`,`${balance} ${med.stock_unit||'units'} remaining; threshold ${med.low_stock_threshold??5}.`,new Date().toISOString(),session.user_id,med.client_id,session.organisation_id,session.organisation_id,med.client_id,`Low stock: ${med.name}`));
  try{await db.batch(statements);}catch(e){if(String(e?.message||e).includes('UNIQUE'))return json({error:{code:'DUPLICATE_ENTRY',message:'This scheduled dose already has an eMAR outcome.'}},409);throw e;}
  return json({ok:true,id:adminId},201);
}
async function dailyMar(db,session,url){
  const clientId=clean(url.searchParams.get('clientId')),date=clean(url.searchParams.get('date'))||localDateString();
  if(!clientId)return json({error:{code:'VALIDATION_ERROR',message:'Choose a client.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404);
  const [meds,entries]=await Promise.all([
    db.prepare(`SELECT * FROM medications WHERE organisation_id=? AND client_id=? AND status='active' AND (start_date IS NULL OR start_date='' OR start_date<=?) AND (end_date IS NULL OR end_date='' OR end_date>=?) ORDER BY name`).bind(session.organisation_id,clientId,date,date).all(),
    db.prepare(`SELECT a.*,m.name AS medication_name,m.strength,m.dose,m.is_prn,u.display_name AS recorded_by_name FROM medication_administrations a JOIN medications m ON m.id=a.medication_id AND m.organisation_id=a.organisation_id LEFT JOIN users u ON u.id=a.recorded_by AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? AND a.client_id=? AND (a.scheduled_date=? OR substr(COALESCE(a.scheduled_at,a.administered_at),1,10)=?) ORDER BY COALESCE(a.scheduled_at,a.administered_at)`).bind(session.organisation_id,clientId,date,date).all()
  ]);
  const rows=[];
  for(const m of meds.results||[]){
    const times=safeJson(m.scheduled_times_json,[]);
    if(m.is_prn){rows.push({kind:'prn',medication:m,scheduledAt:null,entry:null});continue;}
    for(const time of times){const scheduledAt=`${date}T${time.length===5?time+':00':time}`;const entry=(entries.results||[]).find(e=>e.medication_id===m.id&&e.scheduled_at===scheduledAt&&!e.is_void);rows.push({kind:'scheduled',medication:m,scheduledAt,entry:entry||null});}
    if(!times.length)rows.push({kind:'unscheduled',medication:m,scheduledAt:null,entry:null});
  }
  return json({date,rows,entries:entries.results||[]});
}
async function adjustMedicationStock(request,db,session,id){
  const med=await db.prepare('SELECT * FROM medications WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!med)return json({error:{code:'NOT_FOUND',message:'Medication not found.'}},404);
  const i=await readJson(request),quantity=Number(i.quantity),type=clean(i.transactionType)||'adjustment',reason=clean(i.reason);if(!Number.isFinite(quantity)||quantity===0)return json({error:{code:'VALIDATION_ERROR',message:'Enter a non-zero stock quantity.'}},400);if(!reason)return json({error:{code:'VALIDATION_ERROR',message:'Enter a reason for the stock change.'}},400);
  if(!['receipt','return','waste','adjustment'].includes(type))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid stock transaction type.'}},400);
  const current=Number(med.stock_quantity)||0,balance=current+quantity,tid=crypto.randomUUID();if(balance<0)return json({error:{code:'VALIDATION_ERROR',message:`This change would make stock negative. Current stock is ${current}.`}},400);
  await db.batch([db.prepare('UPDATE medications SET stock_quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(balance,id,session.organisation_id),db.prepare(`INSERT INTO medication_stock_transactions(id,organisation_id,medication_id,client_id,transaction_type,quantity,balance_after,reason,recorded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(tid,session.organisation_id,id,med.client_id,type,quantity,balance,reason,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'medication.stock_adjusted','medication',id,{quantity,balance,reason,type})]);return json({ok:true,balance},201);
}
async function correctMedicationAdministration(request,db,session,id){
  const original=await db.prepare(`SELECT a.*,m.stock_quantity,m.client_id AS med_client_id,m.requires_witness,m.controlled_drug FROM medication_administrations a JOIN medications m ON m.id=a.medication_id AND m.organisation_id=a.organisation_id WHERE a.id=? AND a.organisation_id=?`).bind(id,session.organisation_id).first();if(!original)return json({error:{code:'NOT_FOUND',message:'MAR entry not found.'}},404);if(original.is_void)return json({error:{code:'VALIDATION_ERROR',message:'This MAR entry has already been corrected.'}},400);
  const i=await readJson(request),reason=clean(i.correctionReason);if(!reason)return json({error:{code:'VALIDATION_ERROR',message:'Enter the reason for correction.'}},400);
  const witness=await medicationWitness(db,session,original,i);if(witness.error)return json({error:{code:'WITNESS_REQUIRED',message:witness.error}},409);
  const outcome=clean(i.outcome)||original.outcome,allowed=['administered','prompted','refused','omitted','unavailable','hospitalised','asleep','missed'];if(!allowed.includes(outcome))return json({error:{code:'VALIDATION_ERROR',message:'Choose a valid corrected outcome.'}},400);
  if(['refused','omitted','unavailable','hospitalised','asleep','missed'].includes(outcome)&&!clean(i.reason))return json({error:{code:'VALIDATION_ERROR',message:`Record the reason for the ${outcome} outcome.`}},400);
  const replacementId=crypto.randomUUID(),stockUsed=Math.max(0,Number(i.stockUsed)||0),newChange=['administered','prompted'].includes(outcome)?-stockUsed:0,stockDelta=-Number(original.stock_change||0)+newChange,balance=original.stock_quantity===null?null:Number(original.stock_quantity)+stockDelta;if(balance!==null&&balance<0)return json({error:{code:'VALIDATION_ERROR',message:'There is not enough recorded stock for this correction.'}},400);
  const statements=[db.prepare('UPDATE medication_administrations SET is_void=1,correction_reason=? WHERE id=? AND organisation_id=?').bind(reason,id,session.organisation_id),db.prepare(`INSERT INTO medication_administrations(id,organisation_id,medication_id,client_id,visit_id,scheduled_at,scheduled_date,administered_at,outcome,dose_given,reason,notes,stock_change,prn_reason,prn_effectiveness,effectiveness_reviewed_at,corrected_from_id,correction_reason,recorded_by,witness_user_id,witness_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(replacementId,session.organisation_id,original.medication_id,original.client_id,original.visit_id,original.scheduled_at,original.scheduled_date,clean(i.administeredAt)||new Date().toISOString(),outcome,clean(i.doseGiven)||original.dose_given,clean(i.reason),clean(i.notes),newChange,clean(i.prnReason),clean(i.prnEffectiveness),clean(i.prnEffectiveness)?new Date().toISOString():null,id,reason,session.user_id,witness.userId,witness.name),db.prepare('UPDATE medications SET stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL ELSE ? END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(balance,original.medication_id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'medication.administration_corrected','medication_administration',replacementId,{originalId:id,reason,outcome,witnessUserId:witness.userId})];
  if(stockDelta)statements.push(db.prepare(`INSERT INTO medication_stock_transactions(id,organisation_id,medication_id,client_id,transaction_type,quantity,balance_after,reason,administration_id,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,original.medication_id,original.client_id,'correction',stockDelta,balance,reason,replacementId,session.user_id));
  await db.batch(statements);return json({ok:true,id:replacementId},201);
}
async function listBodyMap(db,session,url){
  const clientId=clean(url.searchParams.get('clientId')); if(!clientId)return json({error:{code:'VALIDATION_ERROR',message:'Choose a client.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404);
  const records=await db.prepare(`SELECT b.*,u.display_name AS created_by_name,(SELECT COUNT(*) FROM body_map_updates x WHERE x.body_map_record_id=b.id) AS update_count FROM body_map_records b LEFT JOIN users u ON u.id=b.created_by AND u.organisation_id=b.organisation_id WHERE b.organisation_id=? AND b.client_id=? ORDER BY CASE b.status WHEN 'open' THEN 0 ELSE 1 END,b.first_observed_at DESC`).bind(session.organisation_id,clientId).all();
  const ids=(records.results||[]).map(row=>row.id),updates={};
  if(ids.length){
    const marks=ids.map(()=>'?').join(','),rows=await db.prepare(`SELECT x.*,u.display_name AS recorded_by_name FROM body_map_updates x LEFT JOIN users u ON u.id=x.recorded_by AND u.organisation_id=x.organisation_id WHERE x.organisation_id=? AND x.body_map_record_id IN (${marks}) ORDER BY datetime(x.created_at) DESC`).bind(session.organisation_id,...ids).all();
    for(const row of rows.results||[])(updates[row.body_map_record_id]??=[]).push(row);
  }
  return json({records:(records.results||[]).map(row=>({...row,updates:updates[row.id]||[]}))});
}
async function createBodyMapRecord(request,db,session){
  const i=await readJson(request),clientId=clean(i.clientId),description=clean(i.description),validation=validateBodyMap(i);if(!clientId||validation)return json({error:{code:'VALIDATION_ERROR',message:!clientId?'Choose a client.':validation}},400);
  const client=await ensureOrganisationClient(db,session,clientId);if(!client)return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404); const id=crypto.randomUUID(),severity=clean(i.severity)||'medium',concernType=clean(i.concernType)||'Other',escalate=Boolean(i.createIncident||['high','critical'].includes(severity)),incidentId=escalate?crypto.randomUUID():null;
  const statements=[db.prepare(`INSERT INTO body_map_records(id,organisation_id,client_id,view,x_percent,y_percent,concern_type,body_location,description,size,appearance,severity,action_taken,monitoring_plan,status,first_observed_at,created_by,linked_incident_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clientId,clean(i.view)||'front',Number(i.xPercent),Number(i.yPercent),concernType,clean(i.bodyLocation),description,clean(i.size),clean(i.appearance),severity,clean(i.actionTaken),clean(i.monitoringPlan),'open',new Date(clean(i.firstObservedAt)||Date.now()).toISOString(),session.user_id,incidentId),auditStatement(db,session.organisation_id,session.user_id,'body_map.created','body_map_record',id,{clientId,concernType,severity,incidentId})];
  if(incidentId)statements.push(db.prepare(`INSERT INTO operations_incidents(id,organisation_id,reference_number,branch_id,client_id,reported_by,category,severity,title,description,status,occurred_at,immediate_action,duty_of_candour_required) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?,?)`).bind(incidentId,session.organisation_id,incidentReference(incidentId),client.branch_id||null,clientId,session.user_id,'Body map',severity,`${concernType}: ${clean(i.bodyLocation)||'body-map concern'}`,`Body map record ${id}. ${description}`,new Date(clean(i.firstObservedAt)||Date.now()).toISOString(),clean(i.actionTaken),['high','critical'].includes(severity)?1:0));
  await db.batch(statements); return json({ok:true,id,incidentCreated:Boolean(incidentId),incidentId},201);
}
async function updateBodyMapRecord(request,env,session,id){
  const db=env.DB;
  const row=await db.prepare('SELECT * FROM body_map_records WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first(); if(!row)return json({error:{code:'NOT_FOUND',message:'Body map concern not found.'}},404); const i=await readJson(request),validation=validateBodyMap({...i,view:row.view,severity:clean(i.severity)||row.severity},{update:true});if(validation)return json({error:{code:'VALIDATION_ERROR',message:validation}},400); const note=clean(i.note),status=clean(i.status)||row.status,severity=clean(i.severity)||row.severity,uid=crypto.randomUUID(),shouldCreateIncident=Boolean(i.createIncident||(['high','critical'].includes(severity)&&(!['high','critical'].includes(row.severity)||row.status==='resolved'))),incidentId=shouldCreateIncident?crypto.randomUUID():null;
  const statements=[db.prepare(`INSERT INTO body_map_updates(id,organisation_id,body_map_record_id,note,appearance,action_taken,status,recorded_by) VALUES(?,?,?,?,?,?,?,?)`).bind(uid,session.organisation_id,id,note,clean(i.appearance),clean(i.actionTaken),status,session.user_id),db.prepare(`UPDATE body_map_records SET size=COALESCE(NULLIF(?,''),size),appearance=COALESCE(NULLIF(?,''),appearance),severity=?,action_taken=COALESCE(NULLIF(?,''),action_taken),status=?,linked_incident_id=COALESCE(?,linked_incident_id),resolved_at=CASE WHEN ?='resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.size),clean(i.appearance),severity,clean(i.actionTaken),status,incidentId,status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'body_map.updated','body_map_record',id,{status,severity,incidentId})];
  if(incidentId)statements.push(db.prepare(`INSERT INTO operations_incidents(id,organisation_id,reference_number,branch_id,client_id,reported_by,category,severity,title,description,status,occurred_at,immediate_action,duty_of_candour_required) VALUES(?,?,?,(SELECT branch_id FROM clients WHERE id=? AND organisation_id=?),?,?,?,?,?,?,'open',?,?,?)`).bind(incidentId,session.organisation_id,incidentReference(incidentId),row.client_id,session.organisation_id,row.client_id,session.user_id,'Body map',severity,`${row.concern_type}: ${row.body_location||'body-map concern'}`,`Body map record ${id}${row.status==='resolved'?' reopened':' escalated'}. ${note}`,new Date().toISOString(),clean(i.actionTaken),['high','critical'].includes(severity)?1:0));
  await db.batch(statements);
  let emailDeliveries=[];
  if(incidentId){const incident=await db.prepare('SELECT reference_number,severity,occurred_at FROM operations_incidents WHERE id=? AND organisation_id=?').bind(incidentId,session.organisation_id).first();emailDeliveries=await sendCareIncidentEmails(env,session,{id:incidentId,reference:incident?.reference_number||incidentReference(incidentId),severity:incident?.severity||severity,occurredAt:incident?.occurred_at||new Date().toISOString()});}
  return json({ok:true,id:uid,incidentCreated:Boolean(incidentId),incidentId,emailDeliveries},201);
}

async function platformSearch(db,session,url){
  if(!requirePlatform(session)) return forbidden();
  const q=clean(url.searchParams.get('q')).toLowerCase();
  if(q.length<2) return json({results:[]});
  const like=`%${q}%`;
  const [clients,staff,users]=await Promise.all([
    db.prepare(`SELECT c.id,c.first_name||' '||c.last_name AS name,'client' AS type,o.id AS organisation_id,o.name AS organisation_name,b.name AS branch_name FROM clients c JOIN organisations o ON o.id=c.organisation_id LEFT JOIN branches b ON b.id=c.branch_id WHERE c.status<>'Archived' AND (lower(c.first_name||' '||c.last_name) LIKE ? OR lower(COALESCE(c.nhs_number,'')) LIKE ?) LIMIT 20`).bind(like,like).all(),
    db.prepare(`SELECT s.id,s.first_name||' '||s.last_name AS name,'staff' AS type,o.id AS organisation_id,o.name AS organisation_name,b.name AS branch_name FROM staff s JOIN organisations o ON o.id=s.organisation_id LEFT JOIN branches b ON b.id=s.branch_id WHERE s.status<>'Archived' AND lower(s.first_name||' '||s.last_name) LIKE ? LIMIT 20`).bind(like).all(),
    db.prepare(`SELECT u.id,u.display_name AS name,'user' AS type,o.id AS organisation_id,o.name AS organisation_name,b.name AS branch_name FROM users u JOIN organisations o ON o.id=u.organisation_id LEFT JOIN branches b ON b.id=u.home_branch_id WHERE lower(u.display_name) LIKE ? OR lower(u.email) LIKE ? LIMIT 20`).bind(like,like).all()
  ]);
  return json({results:[...(clients.results||[]),...(staff.results||[]),...(users.results||[])].slice(0,40)});
}
async function platformAudit(db,session,url){
  if(!requirePlatform(session)) return forbidden();
  const limit=Math.min(Math.max(Number(url.searchParams.get('limit'))||100,1),250);
  const r=await db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail_json,a.created_at,o.name AS organisation_name,u.display_name AS user_name FROM audit_log a JOIN organisations o ON o.id=a.organisation_id LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ?`).bind(limit).all();
  return json({events:r.results||[]});
}
async function platformNotifications(db,session){
  if(!requirePlatform(session)) return forbidden();
  const today=new Date();today.setHours(0,0,0,0);const soon=new Date(today);soon.setDate(soon.getDate()+30);
  const [trials,plans,dbs]=await Promise.all([
    db.prepare(`SELECT id,name,trial_ends_at FROM organisations WHERE status='active' AND trial_ends_at IS NOT NULL`).all(),
    db.prepare(`SELECT cp.id,cp.review_date,c.first_name||' '||c.last_name AS client_name,o.name AS organisation_name FROM care_plans cp JOIN clients c ON c.id=cp.client_id JOIN organisations o ON o.id=cp.organisation_id WHERE cp.status='Active' AND cp.review_date IS NOT NULL`).all(),
    db.prepare(`SELECT s.id,s.dbs_expiry,s.first_name||' '||s.last_name AS staff_name,o.name AS organisation_name FROM staff s JOIN organisations o ON o.id=s.organisation_id WHERE s.status='Active' AND s.dbs_expiry IS NOT NULL`).all()
  ]);
  const notices=[];
  for(const o of trials.results||[]){const d=new Date(o.trial_ends_at+'T00:00:00');if(d<=soon)notices.push({type:d<today?'danger':'warning',title:d<today?'Trial expired':'Trial ending',message:`${o.name} · ${o.trial_ends_at}`,organisationId:o.id});}
  for(const p of plans.results||[]){const d=new Date(p.review_date+'T00:00:00');if(d<=soon)notices.push({type:d<today?'danger':'warning',title:d<today?'Care plan overdue':'Care plan due',message:`${p.client_name} · ${p.organisation_name} · ${p.review_date}`});}
  for(const x of dbs.results||[]){const d=new Date(x.dbs_expiry+'T00:00:00');if(d<=soon)notices.push({type:d<today?'danger':'warning',title:d<today?'DBS expired':'DBS expiring',message:`${x.staff_name} · ${x.organisation_name} · ${x.dbs_expiry}`});}
  return json({notifications:notices.sort((a,b)=>a.type==='danger'?-1:1).slice(0,100)});
}
async function platformSystemHealth(db,session){
  if(!requirePlatform(session)) return forbidden();
  const [sessions,recentUsers,errors,auditCount,supportActive,support24h,errorRows,supportRows,jobs,incidents,hourlyAudit,hourlyErrors]=await Promise.all([
    db.prepare("SELECT COUNT(*) total FROM sessions WHERE expires_at>CURRENT_TIMESTAMP").first(),
    db.prepare("SELECT COUNT(DISTINCT user_id) total FROM sessions WHERE last_seen_at>=datetime('now','-30 minutes') AND expires_at>CURRENT_TIMESTAMP").first(),
    db.prepare("SELECT COUNT(*) total FROM api_error_log WHERE created_at>=datetime('now','-24 hours')").first(),
    db.prepare("SELECT COUNT(*) total FROM audit_log WHERE created_at>=datetime('now','-24 hours')").first(),
    db.prepare("SELECT COUNT(*) total FROM support_sessions WHERE ended_at IS NULL").first(),
    db.prepare("SELECT COUNT(*) total FROM support_sessions WHERE started_at>=datetime('now','-24 hours')").first(),
    db.prepare(`SELECT e.id,e.route,e.method,e.error_message,e.created_at,o.name organisation_name,u.display_name user_name
      FROM api_error_log e LEFT JOIN organisations o ON o.id=e.organisation_id LEFT JOIN users u ON u.id=e.user_id
      ORDER BY e.created_at DESC LIMIT 12`).all(),
    db.prepare(`SELECT s.id,s.reason,s.access_mode,s.started_at,s.ended_at,o.name organisation_name,u.display_name platform_user_name
      FROM support_sessions s JOIN organisations o ON o.id=s.organisation_id LEFT JOIN users u ON u.id=s.platform_user_id
      ORDER BY s.started_at DESC LIMIT 12`).all(),
    db.prepare("SELECT * FROM platform_jobs ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'warning' THEN 1 WHEN 'healthy' THEN 2 ELSE 3 END,name").all(),
    db.prepare("SELECT * FROM platform_incidents WHERE status<>'resolved' ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,started_at DESC LIMIT 20").all(),
    db.prepare("SELECT strftime('%Y-%m-%d %H:00',created_at) hour,COUNT(*) total FROM audit_log WHERE created_at>=datetime('now','-24 hours') GROUP BY hour ORDER BY hour").all(),
    db.prepare("SELECT strftime('%Y-%m-%d %H:00',created_at) hour,COUNT(*) total FROM api_error_log WHERE created_at>=datetime('now','-24 hours') GROUP BY hour ORDER BY hour").all()
  ]);
  const errorCount=Number(errors?.total||0),activeSessions=Number(sessions?.total||0),activeSupport=Number(supportActive?.total||0);
  const jobRows=jobs.results||[],failedJobs=jobRows.filter(x=>x.status==='failed').length,warningJobs=jobRows.filter(x=>x.status==='warning').length;
  const computedAlerts=[];
  if(errorCount>=10) computedAlerts.push({severity:'critical',title:`${errorCount} API errors in the last 24 hours`,description:'Review recent errors and affected routes immediately.',source:'API monitoring'});
  else if(errorCount>0) computedAlerts.push({severity:'warning',title:`${errorCount} API error${errorCount===1?'':'s'} in the last 24 hours`,description:'Review the recent error log for recurring patterns.',source:'API monitoring'});
  if(failedJobs) computedAlerts.push({severity:'critical',title:`${failedJobs} scheduled job${failedJobs===1?' has':'s have'} failed`,description:'Review scheduled automation and the latest job result.',source:'Job monitoring'});
  else if(warningJobs) computedAlerts.push({severity:'warning',title:`${warningJobs} scheduled job${warningJobs===1?' requires':'s require'} attention`,description:'A job completed with a warning state.',source:'Job monitoring'});
  if(activeSupport>3) computedAlerts.push({severity:'warning',title:`${activeSupport} support sessions are currently active`,description:'Confirm all support access remains necessary and authorised.',source:'Support governance'});
  const incidentRows=(incidents.results||[]).map(x=>({severity:x.severity,title:x.title,description:x.description,source:x.source,startedAt:x.started_at,id:x.id}));
  const alerts=[...incidentRows,...computedAlerts];
  const overall=alerts.some(x=>x.severity==='critical')?'Attention':alerts.some(x=>x.severity==='warning')?'Monitoring':'Healthy';
  const byHour={}; for(let i=23;i>=0;i--){const d=new Date(Date.now()-i*3600000);d.setMinutes(0,0,0);const key=d.toISOString().slice(0,13).replace('T',' ')+':00';byHour[key]={hour:key,label:new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'}).format(d),audit:0,errors:0};}
  for(const row of hourlyAudit.results||[]) if(byHour[row.hour]) byHour[row.hour].audit=Number(row.total||0);
  for(const row of hourlyErrors.results||[]) if(byHour[row.hour]) byHour[row.hour].errors=Number(row.total||0);
  return json({
    overall,database:'healthy',authentication:'healthy',auditService:'healthy',workerVersion:VERSION,checkedAt:new Date().toISOString(),
    activeSessions,recentUsers:Number(recentUsers?.total||0),errors24h:errorCount,auditEvents24h:Number(auditCount?.total||0),
    supportSessions24h:Number(support24h?.total||0),activeSupportSessions:activeSupport,
    jobSummary:{total:jobRows.length,healthy:jobRows.filter(x=>x.status==='healthy').length,failed:failedJobs,warning:warningJobs},
    services:[
      {name:'Cloudflare Worker',status:'healthy',detail:`Version ${VERSION}`},
      {name:'D1 database',status:'healthy',detail:'Queries responding normally'},
      {name:'Authentication',status:'healthy',detail:`${activeSessions} active sessions`},
      {name:'Audit service',status:'healthy',detail:`${Number(auditCount?.total||0)} events in 24 hours`},
      {name:'API monitoring',status:errorCount===0?'healthy':errorCount<10?'warning':'critical',detail:`${errorCount} errors in 24 hours`},
      {name:'Support governance',status:activeSupport>3?'warning':'healthy',detail:`${activeSupport} active support sessions`}
    ],
    alerts,jobs:jobRows,recentErrors:errorRows.results||[],supportActivity:supportRows.results||[],activity:Object.values(byHour)
  });
}
async function listSubscriptionPlans(db,session){if(!requirePlatform(session))return forbidden();const r=await db.prepare("SELECT * FROM subscription_plans ORDER BY monthly_price_pence,name").all();return json({plans:r.results||[]});}
async function saveSubscriptionPlan(request,db,session){
  if(!requirePlatform(session)||session.access_level!=='platform_owner')return forbidden();const i=await readJson(request),name=clean(i.name),id=clean(i.id)||name.toLowerCase().replace(/[^a-z0-9]+/g,'-');if(!name)return json({error:{code:'VALIDATION_ERROR',message:'Enter a plan name.'}},400);
  await db.prepare(`INSERT INTO subscription_plans(id,name,monthly_price_pence,max_users,max_clients,max_branches,storage_mb,feature_flags_json,status) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,monthly_price_pence=excluded.monthly_price_pence,max_users=excluded.max_users,max_clients=excluded.max_clients,max_branches=excluded.max_branches,storage_mb=excluded.storage_mb,feature_flags_json=excluded.feature_flags_json,status=excluded.status,updated_at=CURRENT_TIMESTAMP`).bind(id,name,Number(i.monthlyPricePence)||0,nullableNumber(i.maxUsers),nullableNumber(i.maxClients),nullableNumber(i.maxBranches),Number(i.storageMb)||1024,typeof i.featureFlags==='object'?JSON.stringify(i.featureFlags):'{}',clean(i.status)||'active').run();
  await audit(db,session.organisation_id,session.user_id,'platform.plan_saved','subscription_plan',id,{name});return json({ok:true,id},201);
}
async function listPlatformUsers(db,session){if(!requirePlatform(session))return forbidden();const r=await db.prepare(`SELECT u.id,u.email,u.display_name,u.access_level,u.status,u.last_login_at,o.name AS organisation_name FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE u.is_platform_user=1 OR u.access_level IN ('platform_owner','platform_admin') ORDER BY u.display_name`).all();return json({users:r.results||[]});}



async function listWorkflows(db,session,url){
  if(!requirePlatform(session))return forbidden();
  const status=clean(url.searchParams.get('status'));
  const where=status&&status!=='all'?'WHERE w.status=?':'';
  const q=`SELECT w.*,o.name AS organisation_name,(SELECT COUNT(*) FROM workflow_runs r WHERE r.workflow_id=w.id) AS run_count,(SELECT status FROM workflow_runs r WHERE r.workflow_id=w.id ORDER BY r.started_at DESC LIMIT 1) AS last_run_status FROM workflow_definitions w LEFT JOIN organisations o ON o.id=w.organisation_id ${where} ORDER BY w.updated_at DESC`;
  const result=status&&status!=='all'?await db.prepare(q).bind(status).all():await db.prepare(q).all();
  return json({workflows:(result.results||[]).map(w=>({...w,conditions:safeJson(w.conditions_json,[]),actions:safeJson(w.actions_json,[])}))});
}
async function listWorkflowTemplates(db,session){if(!requirePlatform(session))return forbidden();const r=await db.prepare("SELECT * FROM workflow_templates WHERE status='active' ORDER BY category,name").all();return json({templates:(r.results||[]).map(x=>({...x,definition:safeJson(x.definition_json,{})}))});}
async function createWorkflow(request,db,session){
  if(!requirePlatform(session))return forbidden();const i=await readJson(request);const name=clean(i.name),trigger=clean(i.triggerType);if(!name||!trigger)return json({error:{code:'VALIDATION_ERROR',message:'Enter a workflow name and select a trigger.'}},400);
  const id=crypto.randomUUID(),scope=clean(i.scope)==='organisation'?'organisation':'platform',orgId=scope==='organisation'?(clean(i.organisationId)||session.organisation_id):null,status=['draft','active','paused'].includes(clean(i.status))?clean(i.status):'draft';
  const conditions=Array.isArray(i.conditions)?i.conditions:[],actions=Array.isArray(i.actions)?i.actions:[];
  if(!actions.length)return json({error:{code:'VALIDATION_ERROR',message:'Add at least one workflow action.'}},400);
  await db.batch([db.prepare(`INSERT INTO workflow_definitions(id,organisation_id,name,description,scope,trigger_type,trigger_config_json,conditions_json,actions_json,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,orgId,name,clean(i.description),scope,trigger,JSON.stringify(i.triggerConfig||{}),JSON.stringify(conditions),JSON.stringify(actions),status,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'platform.workflow_created','workflow',id,{name,trigger,status})]);
  return json({ok:true,id},201);
}
async function updateWorkflow(request,db,session,id){
  if(!requirePlatform(session))return forbidden();const existing=await db.prepare('SELECT * FROM workflow_definitions WHERE id=?').bind(id).first();if(!existing)return notFound('Workflow');const i=await readJson(request),name=clean(i.name)||existing.name,trigger=clean(i.triggerType)||existing.trigger_type,status=['draft','active','paused'].includes(clean(i.status))?clean(i.status):existing.status,scope=clean(i.scope)==='organisation'?'organisation':'platform',orgId=scope==='organisation'?(clean(i.organisationId)||existing.organisation_id||session.organisation_id):null,conditions=Array.isArray(i.conditions)?i.conditions:safeJson(existing.conditions_json,[]),actions=Array.isArray(i.actions)?i.actions:safeJson(existing.actions_json,[]);
  await db.batch([db.prepare(`UPDATE workflow_definitions SET organisation_id=?,name=?,description=?,scope=?,trigger_type=?,trigger_config_json=?,conditions_json=?,actions_json=?,status=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orgId,name,clean(i.description)||existing.description,scope,trigger,JSON.stringify(i.triggerConfig||safeJson(existing.trigger_config_json,{})),JSON.stringify(conditions),JSON.stringify(actions),status,id),auditStatement(db,session.organisation_id,session.user_id,'platform.workflow_updated','workflow',id,{name,status})]);return json({ok:true,id});
}
async function deleteWorkflow(db,session,id){if(!requirePlatform(session))return forbidden();const w=await db.prepare('SELECT name FROM workflow_definitions WHERE id=?').bind(id).first();if(!w)return notFound('Workflow');await db.batch([db.prepare('DELETE FROM workflow_queue WHERE workflow_id=?').bind(id),db.prepare('DELETE FROM workflow_runs WHERE workflow_id=?').bind(id),db.prepare('DELETE FROM workflow_definitions WHERE id=?').bind(id),auditStatement(db,session.organisation_id,session.user_id,'platform.workflow_deleted','workflow',id,{name:w.name})]);return json({ok:true});}
async function runWorkflow(request,db,session,id){
  if(!requirePlatform(session))return forbidden();const w=await db.prepare('SELECT * FROM workflow_definitions WHERE id=?').bind(id).first();if(!w)return notFound('Workflow');const payload=await readJson(request),runId=crypto.randomUUID(),started=Date.now(),actions=safeJson(w.actions_json,[]),results=[];
  await db.prepare(`INSERT INTO workflow_runs(id,workflow_id,organisation_id,trigger_type,trigger_payload_json,status,actions_total,initiated_by) VALUES(?,?,?,?,?,'running',?,?)`).bind(runId,id,w.organisation_id,w.trigger_type,JSON.stringify(payload||{}),actions.length,session.user_id).run();
  try{for(const action of actions){const type=clean(action.type);if(type==='audit_entry')await audit(db,w.organisation_id||session.organisation_id,session.user_id,'workflow.action_executed','workflow',id,{runId,action:type});else if(type==='executive_alert')await db.prepare(`INSERT INTO platform_notifications(id,type,title,message,source,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(crypto.randomUUID(),'warning',`Workflow alert: ${w.name}`,clean(action.message)||`Workflow ${w.name} raised an executive alert.`,'workflow').run().catch(()=>null);results.push({type,status:'completed'});}
    const duration=Date.now()-started;await db.batch([db.prepare(`UPDATE workflow_runs SET status='completed',actions_completed=?,result_json=?,finished_at=CURRENT_TIMESTAMP,duration_ms=? WHERE id=?`).bind(actions.length,JSON.stringify({actions:results}),duration,runId),db.prepare('UPDATE workflow_definitions SET last_run_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),auditStatement(db,session.organisation_id,session.user_id,'platform.workflow_run','workflow',id,{runId,status:'completed'})]);return json({ok:true,runId,status:'completed',actionsCompleted:actions.length,durationMs:duration});
  }catch(error){const duration=Date.now()-started;await db.prepare(`UPDATE workflow_runs SET status='failed',error_message=?,finished_at=CURRENT_TIMESTAMP,duration_ms=? WHERE id=?`).bind(String(error.message||error).slice(0,500),duration,runId).run();return json({error:{code:'WORKFLOW_FAILED',message:'The workflow test run failed.'},runId},500);}
}
async function listWorkflowRuns(db,session,url){if(!requirePlatform(session))return forbidden();const workflowId=clean(url.searchParams.get('workflowId'));const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||30));const q=`SELECT r.*,w.name AS workflow_name,o.name AS organisation_name FROM workflow_runs r JOIN workflow_definitions w ON w.id=r.workflow_id LEFT JOIN organisations o ON o.id=r.organisation_id ${workflowId?'WHERE r.workflow_id=?':''} ORDER BY r.started_at DESC LIMIT ?`;const result=workflowId?await db.prepare(q).bind(workflowId,limit).all():await db.prepare(q).bind(limit).all();return json({runs:result.results||[]});}
function safeJson(value,fallback){try{return JSON.parse(value||'')}catch{return fallback}}

function requirePlatformIdentity(session) {
  return session.is_platform_user || session.access_level === "platform_owner" || session.access_level === "platform_admin";
}
function requirePlatform(session) {
  return !session.support_mode && requirePlatformIdentity(session);
}

async function platformDashboard(db, session) {
  if(!requirePlatform(session)) return forbidden();
  const today=new Date(); today.setHours(0,0,0,0); const inThirty=new Date(today); inThirty.setDate(inThirty.getDate()+30);
  const [orgs,branches,users,activeUsers,clients,staff,plans,risks,activity,errors,sessions] = await Promise.all([
    db.prepare(`SELECT o.id,o.name,o.slug,o.status,o.subscription_plan,o.subscription_status,o.trial_ends_at,o.renewal_date,o.created_at,
      COUNT(DISTINCT b.id) AS branch_count,COUNT(DISTINCT u.id) AS user_count,COUNT(DISTINCT c.id) AS client_count,COUNT(DISTINCT s.id) AS staff_count,
      MAX(a.created_at) AS last_activity_at,sp.name AS plan_name,COALESCE(sp.monthly_price_pence,0) AS monthly_price_pence
      FROM organisations o LEFT JOIN branches b ON b.organisation_id=o.id LEFT JOIN users u ON u.organisation_id=o.id
      LEFT JOIN clients c ON c.organisation_id=o.id AND c.status<>'Archived' LEFT JOIN staff s ON s.organisation_id=o.id AND s.status='Active'
      LEFT JOIN audit_log a ON a.organisation_id=o.id LEFT JOIN subscription_plans sp ON sp.id=o.subscription_plan
      GROUP BY o.id ORDER BY o.name COLLATE NOCASE`).all(),
    db.prepare("SELECT COUNT(*) AS total FROM branches WHERE status='active'").first(), db.prepare("SELECT COUNT(*) AS total FROM users WHERE status='active'").first(),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS total FROM sessions WHERE last_seen_at>=datetime('now','-30 days')").first(),
    db.prepare("SELECT COUNT(*) AS total FROM clients WHERE status<>'Archived'").first(), db.prepare("SELECT COUNT(*) AS total FROM staff WHERE status='Active'").first(),
    db.prepare("SELECT organisation_id,review_date,status FROM care_plans WHERE status='Active'").all(), db.prepare("SELECT organisation_id,severity,status FROM risk_assessments WHERE status='Active'").all(),
    db.prepare(`SELECT a.action,a.entity_type,a.created_at,o.name AS organisation_name,u.display_name AS user_name FROM audit_log a JOIN organisations o ON o.id=a.organisation_id LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 18`).all(),
    db.prepare("SELECT COUNT(*) AS total FROM api_error_log WHERE created_at>=datetime('now','-1 day')").first(), db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE expires_at>CURRENT_TIMESTAMP").first()
  ]);
  const orgRows=orgs.results||[], planRows=plans.results||[], riskRows=risks.results||[];
  const perOrgPlans={},perOrgRisks={}; for(const p of planRows)(perOrgPlans[p.organisation_id]??=[]).push(p); for(const r of riskRows)(perOrgRisks[r.organisation_id]??=[]).push(r);
  const enriched=orgRows.map(o=>{const last=o.last_activity_at?new Date(o.last_activity_at+'Z'):null,daysInactive=last?Math.floor((Date.now()-last.getTime())/86400000):999; const op=perOrgPlans[o.id]||[],or=perOrgRisks[o.id]||[]; const overdue=op.filter(p=>p.review_date&&new Date(p.review_date+'T00:00:00')<today).length; let score=100;if(o.status!=='active')score-=45;if(daysInactive>30)score-=25;else if(daysInactive>14)score-=12;if(overdue)score-=Math.min(25,overdue*5);if(or.some(r=>r.severity==='High'))score-=10;if(!o.user_count)score-=15;score=Math.max(0,Math.min(100,score));return {...o,health_score:score,days_inactive:daysInactive,overdue_plans:overdue};});
  const billable=enriched.filter(o=>o.status==='active'&&o.subscription_status!=='cancelled'); const mrrPence=billable.reduce((n,o)=>n+Number(o.monthly_price_pence||0),0); const avgHealth=enriched.length?enriched.reduce((n,o)=>n+o.health_score,0)/enriched.length:100; const atRisk=enriched.filter(o=>o.health_score<70).sort((a,b)=>a.health_score-b.health_score).slice(0,8).map(o=>({...o,reason:o.status!=='active'?'Account not active':o.days_inactive>14?`No activity for ${o.days_inactive} days`:o.overdue_plans?`${o.overdue_plans} overdue care plan review${o.overdue_plans===1?'':'s'}`:'Low adoption'}));
  const renewals=enriched.filter(o=>o.renewal_date).map(o=>{const d=Math.ceil((new Date(o.renewal_date+'T00:00:00')-today)/86400000);return {...o,days_until:d}}).filter(o=>o.days_until>=0&&o.days_until<=30).sort((a,b)=>a.days_until-b.days_until);
  const overduePlans=planRows.filter(p=>p.review_date&&new Date(p.review_date+'T00:00:00')<today).length, highRisks=riskRows.filter(r=>r.severity==='High').length, errorCount=Number(errors?.total||0);
  const briefingItems=[
    {icon:'£',title:`MRR is ${new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(mrrPence/100)}`,detail:`Annual run rate ${new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(mrrPence*12/100)}`,tone:'success'},
    {icon:'◆',title:`${billable.length} active customer organisation${billable.length===1?'':'s'}`,detail:`${Number(activeUsers?.total||0)} users active in the last 30 days`,tone:'neutral'},
    {icon:'!',title:atRisk.length?`${atRisk.length} organisation${atRisk.length===1?'':'s'} need attention`:'Customer portfolio is healthy',detail:atRisk.length?'Open Customer Success to review risk':'No immediate retention risks identified',tone:atRisk.length?'warning':'success'},
    {icon:'◷',title:renewals.length?`${renewals.length} renewal${renewals.length===1?'':'s'} due within 30 days`:'No imminent renewals',detail:renewals[0]?`${renewals[0].name} is next in ${renewals[0].days_until} days`:'Your renewal calendar is clear',tone:'neutral'},
    {icon:'✓',title:errorCount?`${errorCount} platform error${errorCount===1?'':'s'} recorded in 24 hours`:'No platform errors recorded',detail:`${Number(sessions?.total||0)} active sessions · Database healthy`,tone:errorCount?'warning':'success'}
  ];
  return json({summary:{organisations:enriched.length,activeOrganisations:enriched.filter(o=>o.status==='active').length,suspendedOrganisations:enriched.filter(o=>o.status==='suspended').length,branches:Number(branches?.total||0),users:Number(users?.total||0),activeUsers30d:Number(activeUsers?.total||0),clients:Number(clients?.total||0),staff:Number(staff?.total||0),carePlansOverdue:overduePlans,highRisks},financials:{mrrPence,arrPence:mrrPence*12,averageRevenuePence:billable.length?Math.round(mrrPence/billable.length):0},customerSuccess:{averageHealth:avgHealth,needsAttention:atRisk.length,healthy:enriched.filter(o=>o.health_score>=80).length},operations:{overall:errorCount===0?'Healthy':errorCount<5?'Monitoring':'Attention',database:'Healthy',activeSessions:Number(sessions?.total||0),errors24h:errorCount},briefing:{headline:atRisk.length?`${atRisk.length} customer organisation${atRisk.length===1?' requires':'s require'} your attention today. Otherwise, the platform is operating normally.`:'Your customer portfolio and CoreCare platform are operating normally.',items:briefingItems},organisations:enriched,atRiskOrganisations:atRisk,renewals,activity:activity.results||[]});
}

async function platformRevenue(db, session) {
  if(!requirePlatform(session)) return forbidden();
  const result=await db.prepare(`SELECT o.id,o.name,o.status,o.subscription_status,o.subscription_plan,o.created_at,o.renewal_date,
    COALESCE(sp.name,o.subscription_plan,'Unassigned') AS plan_name,COALESCE(sp.monthly_price_pence,0) AS monthly_price_pence
    FROM organisations o LEFT JOIN subscription_plans sp ON sp.id=o.subscription_plan ORDER BY o.created_at,o.name`).all();
  const rows=result.results||[], now=new Date(), monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const isBillable=o=>o.status==='active'&&o.subscription_status!=='cancelled';
  const billable=rows.filter(isBillable), mrrPence=billable.reduce((n,o)=>n+Number(o.monthly_price_pence||0),0);
  const newMrrPence=billable.filter(o=>new Date(`${o.created_at}Z`)>=monthStart).reduce((n,o)=>n+Number(o.monthly_price_pence||0),0);
  const lostMrrPence=rows.filter(o=>o.subscription_status==='cancelled'||o.status==='suspended').reduce((n,o)=>n+Number(o.monthly_price_pence||0),0);
  const planMap={}; for(const o of billable){const key=o.plan_name||'Unassigned'; if(!planMap[key])planMap[key]={name:key,organisations:0,mrrPence:0};planMap[key].organisations++;planMap[key].mrrPence+=Number(o.monthly_price_pence||0)}
  const planBreakdown=Object.values(planMap).sort((a,b)=>b.mrrPence-a.mrrPence);
  const trend=[]; for(let offset=11;offset>=0;offset--){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-offset,1));const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));const activeAtEnd=rows.filter(o=>new Date(`${o.created_at}Z`)<end&&o.subscription_status!=='cancelled'&&o.status!=='suspended');trend.push({month:d.toISOString().slice(0,7),label:new Intl.DateTimeFormat('en-GB',{month:'short',year:'2-digit',timeZone:'UTC'}).format(d),mrrPence:activeAtEnd.reduce((n,o)=>n+Number(o.monthly_price_pence||0),0),organisations:activeAtEnd.length})}
  const renewals=rows.filter(o=>isBillable(o)&&o.renewal_date).map(o=>({...o,daysUntil:Math.ceil((new Date(`${o.renewal_date}T00:00:00Z`)-now)/86400000)})).filter(o=>o.daysUntil>=0).sort((a,b)=>a.daysUntil-b.daysUntil);
  const renewal30=renewals.filter(o=>o.daysUntil<=30), renewal90=renewals.filter(o=>o.daysUntil<=90);
  return json({generatedAt:new Date().toISOString(),metrics:{mrrPence,arrPence:mrrPence*12,newMrrPence,lostMrrPence,netMovementPence:newMrrPence-lostMrrPence,averageRevenuePence:billable.length?Math.round(mrrPence/billable.length):0,billableOrganisations:billable.length,renewal30Pence:renewal30.reduce((n,o)=>n+Number(o.monthly_price_pence||0),0),renewal90Pence:renewal90.reduce((n,o)=>n+Number(o.monthly_price_pence||0),0)},planBreakdown,trend,renewals:renewals.slice(0,25),organisations:rows.map(o=>({...o,billable:isBillable(o)}))});
}


async function platformCustomerSuccess(db, session) {
  if(!requirePlatform(session)) return forbidden();
  const [orgs,plans,risks,support,auditRows]=await Promise.all([
    db.prepare(`SELECT o.id,o.name,o.status,o.subscription_status,o.subscription_plan,o.created_at,o.renewal_date,
      COALESCE(sp.name,o.subscription_plan,'Unassigned') plan_name,COALESCE(sp.monthly_price_pence,0) monthly_price_pence,
      COUNT(DISTINCT u.id) user_count,COUNT(DISTINCT CASE WHEN u.last_login_at>=datetime('now','-30 days') THEN u.id END) active_users_30d,
      COUNT(DISTINCT b.id) branch_count,COUNT(DISTINCT c.id) client_count,MAX(a.created_at) last_activity_at
      FROM organisations o LEFT JOIN subscription_plans sp ON sp.id=o.subscription_plan LEFT JOIN users u ON u.organisation_id=o.id
      LEFT JOIN branches b ON b.organisation_id=o.id LEFT JOIN clients c ON c.organisation_id=o.id LEFT JOIN audit_log a ON a.organisation_id=o.id
      GROUP BY o.id ORDER BY o.name COLLATE NOCASE`).all(),
    db.prepare("SELECT organisation_id,review_date,status FROM care_plans WHERE status='Active'").all(),
    db.prepare("SELECT organisation_id,severity,status FROM risk_assessments WHERE status='Active'").all(),
    db.prepare("SELECT organisation_id,COUNT(*) total,MAX(started_at) last_support_at FROM support_sessions WHERE started_at>=datetime('now','-90 days') GROUP BY organisation_id").all(),
    db.prepare("SELECT organisation_id,action,created_at FROM audit_log WHERE created_at>=datetime('now','-90 days') ORDER BY created_at DESC").all()
  ]);
  const now=new Date(), byPlans={},byRisks={},bySupport={},byAudit={};
  for(const x of plans.results||[])(byPlans[x.organisation_id]??=[]).push(x);
  for(const x of risks.results||[])(byRisks[x.organisation_id]??=[]).push(x);
  for(const x of support.results||[])bySupport[x.organisation_id]=x;
  for(const x of auditRows.results||[])(byAudit[x.organisation_id]??=[]).push(x);
  const moduleName=a=>a.startsWith('client')?'Clients':a.startsWith('staff')?'Staff':a.startsWith('care_plan')?'Care Plans':a.startsWith('risk')?'Risks':a.startsWith('document')?'Documents':a.startsWith('security')||a.startsWith('auth')?'Security':a.startsWith('platform.support')?'Support':'Administration';
  const organisations=(orgs.results||[]).map(o=>{
    const activity=byAudit[o.id]||[], last=o.last_activity_at?new Date(o.last_activity_at+'Z'):null, daysInactive=last?Math.floor((now-last)/86400000):999;
    const overdue=(byPlans[o.id]||[]).filter(x=>x.review_date&&new Date(x.review_date+'T00:00:00Z')<now).length;
    const high=(byRisks[o.id]||[]).filter(x=>x.severity==='High').length, supportCount=Number(bySupport[o.id]?.total||0);
    const activeUsers=Number(o.active_users_30d||0), users=Number(o.user_count||0), adoption=users?Math.round(activeUsers/users*100):0;
    let score=100; const reasons=[];
    if(o.status!=='active'){score-=40;reasons.push('Account is not active')}
    if(o.subscription_status==='cancelled'){score-=35;reasons.push('Subscription is cancelled')}
    if(daysInactive>30){score-=25;reasons.push(`No activity for ${daysInactive} days`)} else if(daysInactive>14){score-=12;reasons.push(`Low activity for ${daysInactive} days`)}
    if(adoption<25){score-=20;reasons.push(`Only ${adoption}% of users active`)} else if(adoption<50){score-=10;reasons.push(`User adoption is ${adoption}%`)}
    if(overdue){score-=Math.min(20,overdue*4);reasons.push(`${overdue} overdue care plan review${overdue===1?'':'s'}`)}
    if(high){score-=Math.min(15,high*5);reasons.push(`${high} high risk${high===1?'':'s'} open`)}
    if(supportCount>=5){score-=10;reasons.push(`${supportCount} support sessions in 90 days`)}
    score=Math.max(0,Math.min(100,score));
    const modules={};for(const a of activity){const m=moduleName(a.action||'');modules[m]=(modules[m]||0)+1}
    const moduleUsage=Object.entries(modules).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
    const recommendations=[];
    if(daysInactive>14)recommendations.push('Arrange an engagement check-in with the organisation owner.');
    if(adoption<50)recommendations.push('Offer user adoption training and review inactive licences.');
    if(overdue)recommendations.push('Recommend a care-plan review workshop.');
    if(!modules.Risks)recommendations.push('Introduce the Risk Assessments module.');
    if(!modules.Documents)recommendations.push('Demonstrate document management and compliance storage.');
    if(supportCount>=5)recommendations.push('Review recurring support themes and create a success plan.');
    if(!recommendations.length)recommendations.push('Maintain regular success contact and identify expansion opportunities.');
    return {...o,health_score:score,health_band:score>=80?'healthy':score>=60?'attention':'risk',trend:daysInactive<=7?'up':daysInactive<=21?'steady':'down',days_inactive:daysInactive,adoption_score:adoption,overdue_plans:overdue,high_risks:high,support_90d:supportCount,reasons,recommendations,module_usage:moduleUsage};
  }).sort((a,b)=>a.health_score-b.health_score);
  const healthy=organisations.filter(o=>o.health_band==='healthy').length, attention=organisations.filter(o=>o.health_band==='attention').length, risk=organisations.filter(o=>o.health_band==='risk').length;
  const avg=organisations.length?Math.round(organisations.reduce((n,o)=>n+o.health_score,0)/organisations.length):100;
  return json({generatedAt:new Date().toISOString(),summary:{averageHealth:avg,healthy,attention,risk,averageAdoption:organisations.length?Math.round(organisations.reduce((n,o)=>n+o.adoption_score,0)/organisations.length):0,openRecommendations:organisations.reduce((n,o)=>n+o.recommendations.length,0)},organisations});
}

async function listOrganisations(db, session) {
  if (!requirePlatform(session)) return forbidden();
  const result = await db.prepare(`SELECT o.*,COUNT(DISTINCT b.id) branch_count,COUNT(DISTINCT u.id) user_count,COUNT(DISTINCT c.id) client_count FROM organisations o LEFT JOIN branches b ON b.organisation_id=o.id LEFT JOIN users u ON u.organisation_id=o.id LEFT JOIN clients c ON c.organisation_id=o.id GROUP BY o.id ORDER BY o.name COLLATE NOCASE`).all();
  return json({organisations:result.results});
}
async function createOrganisation(request, db, session) {
  if (!requirePlatform(session)) return forbidden();
  const input=await readJson(request), name=clean(input.name), plan=clean(input.subscriptionPlan)||"development";
  if(!name) return json({error:{code:"VALIDATION_ERROR",message:"Enter an organisation name."}},400);
  const id=crypto.randomUUID(), branchId=crypto.randomUUID(), slug=(clean(input.slug)||name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+id.slice(0,6);
  await db.batch([
    db.prepare("INSERT INTO organisations(id,name,slug,status,subscription_plan) VALUES(?,?,?,?,?)").bind(id,name,slug,"active",plan),
    db.prepare("INSERT INTO branches(id,organisation_id,name,code,status) VALUES(?,?,?,?,?)").bind(branchId,id,"Main Branch","MAIN","active"),
    ...workforceSetupStatements(db,id,session.user_id),
    auditStatement(db,session.organisation_id,session.user_id,"platform.organisation_created","organisation",id,{name})
  ]);
  return json({organisation:{id,name,slug,status:"active",subscription_plan:plan}},201);
}
async function updateOrganisationAdmin(request,db,session,id){
  if(!requirePlatform(session)) return forbidden();
  const input=await readJson(request);
  const existing=await db.prepare("SELECT * FROM organisations WHERE id=?").bind(id).first();
  if(!existing) return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404);
  const name=clean(input.name)||existing.name;
  const status=clean(input.status)||existing.status||"active";
  if(!["active","suspended","archived"].includes(status)) return json({error:{code:"VALIDATION_ERROR",message:"Choose a valid organisation status."}},400);
  const plan=clean(input.subscriptionPlan)||existing.subscription_plan||"development";
  const flags=typeof input.featureFlags==='object'?JSON.stringify(input.featureFlags):(clean(input.featureFlagsJson)||existing.feature_flags_json||'{}');
  await db.prepare(`UPDATE organisations SET name=?,status=?,subscription_plan=?,subscription_status=?,trial_ends_at=?,renewal_date=?,licence_reference=?,max_users=?,max_clients=?,max_branches=?,storage_limit_mb=?,logo_url=?,primary_colour=?,contact_email=?,contact_phone=?,feature_flags_json=?,suspended_at=CASE WHEN ?='suspended' THEN COALESCE(suspended_at,CURRENT_TIMESTAMP) ELSE NULL END,archived_at=CASE WHEN ?='archived' THEN COALESCE(archived_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(
    name,status,plan,clean(input.subscriptionStatus)||existing.subscription_status||'trial',clean(input.trialEndsAt)||null,clean(input.renewalDate)||null,clean(input.licenceReference)||null,
    nullableNumber(input.maxUsers,existing.max_users),nullableNumber(input.maxClients,existing.max_clients),nullableNumber(input.maxBranches,existing.max_branches),nullableNumber(input.storageLimitMb,existing.storage_limit_mb)||1024,
    clean(input.logoUrl)||null,clean(input.primaryColour)||'#1f6f5f',clean(input.contactEmail)||null,clean(input.contactPhone)||null,flags,status,status,id).run();
  await audit(db,session.organisation_id,session.user_id,"platform.organisation_updated","organisation",id,{name,status,plan});
  return json({ok:true});
}
function nullableNumber(value,fallback=null){if(value===undefined||value===null||value==='')return fallback===undefined?null:fallback;const n=Number(value);return Number.isFinite(n)?n:null;}
async function switchOrganisation(request,db,session){
  if(!requirePlatform(session)) return forbidden(); const input=await readJson(request),orgId=clean(input.organisationId),branchId=clean(input.branchId)||null,reason=clean(input.reason),accessMode=clean(input.accessMode)==='read_only'?'read_only':'full';
  if(!reason || reason.length<5) return json({error:{code:"SUPPORT_REASON_REQUIRED",message:"Enter a brief reason for entering Support Mode."}},400);
  const org=await db.prepare("SELECT id,name,status FROM organisations WHERE id=?").bind(orgId).first(); if(!org)return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404);
  if(org.status!=="active") return json({error:{code:"ORGANISATION_SUSPENDED",message:"This organisation is suspended."}},403);
  if(branchId){const branch=await db.prepare("SELECT id FROM branches WHERE id=? AND organisation_id=? AND status='active'").bind(branchId,orgId).first();if(!branch)return json({error:{code:"INVALID_BRANCH",message:"Branch does not belong to this organisation."}},400);}
  const origin=session.support_mode ? session.support_origin_organisation_id : session.organisation_id;
  const supportId=crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE sessions SET organisation_id=?,active_branch_id=?,switched_by_platform_user=1,support_mode=1,support_origin_organisation_id=?,support_started_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(orgId,branchId,origin,session.session_id),
    db.prepare("INSERT INTO support_sessions(id,organisation_id,platform_user_id,reason,access_mode,session_id) VALUES(?,?,?,?,?,?)").bind(supportId,orgId,session.user_id,reason,accessMode,session.session_id),
    auditStatement(db,orgId,session.user_id,"platform.support_mode_entered","organisation",orgId,{from:session.organisation_id,branchId,reason,accessMode,supportId})
  ]);
  return json({ok:true,organisation:org,supportMode:true});
}
async function exitSupportMode(db,session){
  if(!requirePlatformIdentity(session)) return forbidden();
  if(!session.support_mode) return json({ok:true,supportMode:false});
  const origin=session.support_origin_organisation_id;
  const org=origin?await db.prepare("SELECT id,name,status FROM organisations WHERE id=?").bind(origin).first():null;
  const fallback=org||await db.prepare("SELECT id,name,status FROM organisations WHERE status='active' ORDER BY created_at LIMIT 1").first();
  if(!fallback)return json({error:{code:"NO_ORGANISATION",message:"No active platform organisation is available."}},409);
  await db.batch([
    db.prepare("UPDATE support_sessions SET ended_at=CURRENT_TIMESTAMP WHERE session_id=? AND ended_at IS NULL").bind(session.session_id),
    db.prepare("UPDATE sessions SET organisation_id=?,active_branch_id=NULL,support_mode=0,support_origin_organisation_id=NULL,support_started_at=NULL,last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(fallback.id,session.session_id),
    auditStatement(db,session.organisation_id,session.user_id,"platform.support_mode_exited","organisation",session.organisation_id,{returnedTo:fallback.id})
  ]);
  return json({ok:true,supportMode:false,organisation:fallback});
}
async function getPlatformOrganisation(db,session,id){
  if(!requirePlatform(session)) return forbidden();
  const org=await db.prepare(`SELECT o.*,
    sp.name AS plan_name,sp.monthly_price_pence,sp.max_users,sp.max_clients,sp.max_storage_mb,
    (SELECT COUNT(*) FROM branches b WHERE b.organisation_id=o.id) branch_count,
    (SELECT COUNT(*) FROM users u WHERE u.organisation_id=o.id) user_count,
    (SELECT COUNT(*) FROM users u WHERE u.organisation_id=o.id AND u.status='active') active_user_count,
    (SELECT COUNT(*) FROM clients c WHERE c.organisation_id=o.id AND c.status<>'Archived') client_count,
    (SELECT COUNT(*) FROM staff st WHERE st.organisation_id=o.id AND st.status='Active') staff_count,
    (SELECT MAX(al.created_at) FROM audit_log al WHERE al.organisation_id=o.id) last_activity_at,
    (SELECT COUNT(*) FROM care_plans cp WHERE cp.organisation_id=o.id AND cp.status='Active') active_care_plans,
    (SELECT COUNT(*) FROM care_plans cp WHERE cp.organisation_id=o.id AND cp.status='Active' AND cp.review_date<date('now')) overdue_care_plans,
    (SELECT COUNT(*) FROM risk_assessments ra WHERE ra.organisation_id=o.id AND lower(COALESCE(ra.risk_level,'')) IN ('high','critical') AND lower(COALESCE(ra.status,'active')) NOT IN ('closed','archived')) high_risks,
    (SELECT COUNT(*) FROM client_documents cd WHERE cd.organisation_id=o.id) document_count
    FROM organisations o LEFT JOIN subscription_plans sp ON sp.id=o.subscription_plan WHERE o.id=?`).bind(id).first();
  if(!org)return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404);
  const [support,branches,users,auditRows,notes,security,logins,revenue]=await Promise.all([
    db.prepare(`SELECT ss.*,u.display_name FROM support_sessions ss LEFT JOIN users u ON u.id=ss.platform_user_id WHERE ss.organisation_id=? ORDER BY ss.started_at DESC LIMIT 20`).bind(id).all(),
    db.prepare(`SELECT b.*,(SELECT COUNT(*) FROM users u WHERE u.organisation_id=b.organisation_id AND u.home_branch_id=b.id) user_count,(SELECT COUNT(*) FROM clients c WHERE c.organisation_id=b.organisation_id AND c.branch_id=b.id AND c.status<>'Archived') client_count FROM branches b WHERE b.organisation_id=? ORDER BY b.status,b.name`).bind(id).all(),
    db.prepare(`SELECT u.id,u.display_name,u.email,u.access_level,u.status,u.last_login_at,b.name branch_name FROM users u LEFT JOIN branches b ON b.id=u.home_branch_id WHERE u.organisation_id=? ORDER BY CASE WHEN u.status='active' THEN 0 ELSE 1 END,u.display_name LIMIT 100`).bind(id).all(),
    db.prepare(`SELECT al.*,u.display_name user_name FROM audit_log al LEFT JOIN users u ON u.id=al.user_id WHERE al.organisation_id=? ORDER BY al.created_at DESC LIMIT 40`).bind(id).all(),
    db.prepare(`SELECT csn.*,u.display_name author_name FROM customer_success_notes csn LEFT JOIN users u ON u.id=csn.created_by WHERE csn.organisation_id=? ORDER BY csn.created_at DESC LIMIT 20`).bind(id).all(),
    db.prepare(`SELECT * FROM organisation_security_policies WHERE organisation_id=?`).bind(id).first(),
    db.prepare(`SELECT lh.*,u.display_name FROM login_history lh LEFT JOIN users u ON u.id=lh.user_id WHERE lh.organisation_id=? ORDER BY lh.created_at DESC LIMIT 20`).bind(id).all(),
    db.prepare(`SELECT * FROM revenue_events WHERE organisation_id=? ORDER BY occurred_at DESC LIMIT 20`).bind(id).all()
  ]);
  const activeUsers30=Number((await db.prepare(`SELECT COUNT(DISTINCT user_id) total FROM audit_log WHERE organisation_id=? AND created_at>=datetime('now','-30 days')`).bind(id).first())?.total||0);
  const health=calculateOrganisationHealth({...org,active_users_30d:activeUsers30});
  return json({
    organisation:{...normaliseOrganisation(org),health_score:health.score,health_band:health.band,health_reasons:health.reasons,active_users_30d:activeUsers30},
    supportHistory:support.results||[],branches:branches.results||[],users:users.results||[],activity:auditRows.results||[],successNotes:notes.results||[],securityPolicy:security||null,loginHistory:logins.results||[],revenueEvents:revenue.results||[]
  });
}
function parseJson(value,fallback){try{return JSON.parse(value||'')}catch{return fallback}}
function normaliseOrganisation(org){return {...org,featureFlags:parseJson(org.feature_flags_json,{}),terminology:parseJson(org.terminology_json,{}),dashboardWidgets:parseJson(org.dashboard_widgets_json,["metrics","attention","activity","compliance"]),sidebarOrder:parseJson(org.sidebar_order_json,[])}}
async function getOrganisationProfile(db,session){
  const org=await db.prepare("SELECT * FROM organisations WHERE id=?").bind(session.organisation_id).first();
  if(!org)return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404);
  return json({organisation:normaliseOrganisation(org)});
}
async function updateOrganisationProfile(request,db,session){
  const i=await readJson(request),name=clean(i.name),colour=clean(i.primaryColour)||"#1f6f5f",secondary=clean(i.secondaryColour)||"#0f172a";
  if(!name)return json({error:{code:"VALIDATION_ERROR",message:"Enter an organisation name."}},400);
  const terminology=JSON.stringify(i.terminology||{}),widgets=JSON.stringify(i.dashboardWidgets||["metrics","attention","activity","compliance"]),sidebar=JSON.stringify(i.sidebarOrder||[]);
  await db.batch([
    db.prepare(`UPDATE organisations SET name=?,short_name=?,logo_url=?,primary_colour=?,secondary_colour=?,contact_email=?,contact_phone=?,website=?,email_sender_name=?,login_message=?,dashboard_welcome=?,document_header=?,document_footer=?,invoice_footer=?,timezone=?,currency=?,date_format=?,time_format=?,week_start=?,terminology_json=?,dashboard_widgets_json=?,sidebar_order_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name,clean(i.shortName),clean(i.logoUrl),colour,secondary,clean(i.contactEmail),clean(i.contactPhone),clean(i.website),clean(i.emailSenderName),clean(i.loginMessage),clean(i.dashboardWelcome),clean(i.documentHeader),clean(i.documentFooter),clean(i.invoiceFooter),clean(i.timezone)||'Europe/London',clean(i.currency)||'GBP',clean(i.dateFormat)||'DD/MM/YYYY',clean(i.timeFormat)||'24h',clean(i.weekStart)||'monday',terminology,widgets,sidebar,session.organisation_id),
    auditStatement(db,session.organisation_id,session.user_id,"organisation.customisation_updated","organisation",session.organisation_id,{name,colour})
  ]);
  return getOrganisationProfile(db,session);
}
async function listBranches(db,session){const r=await db.prepare("SELECT * FROM branches WHERE organisation_id=? ORDER BY status,name COLLATE NOCASE").bind(session.organisation_id).all();return json({branches:r.results});}
async function createBranch(request,db,session){const i=await readJson(request),name=clean(i.name);if(!name)return json({error:{code:"VALIDATION_ERROR",message:"Enter a branch name."}},400);const id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO branches(id,organisation_id,name,code,address,phone,email,status) VALUES(?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),"active"),auditStatement(db,session.organisation_id,session.user_id,"branch.created","branch",id,{name})]);return json({branch:{id,name,status:"active"}},201);}
async function updateBranch(request,db,session,id){const i=await readJson(request),name=clean(i.name),status=clean(i.status)||"active";if(!name)return json({error:{code:"VALIDATION_ERROR",message:"Enter a branch name."}},400);if(!["active","inactive"].includes(status))return json({error:{code:"VALIDATION_ERROR",message:"Choose a valid branch status."}},400);const existing=await db.prepare("SELECT id,name,code,address,phone,email,status FROM branches WHERE id=? AND organisation_id=? LIMIT 1").bind(id,session.organisation_id).first();if(!existing)return json({error:{code:"NOT_FOUND",message:"Branch not found."}},404);await db.batch([db.prepare("UPDATE branches SET name=?,code=?,address=?,phone=?,email=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,"branch.updated","branch",id,{before:existing,after:{name,code:clean(i.code),address:clean(i.address),phone:clean(i.phone),email:clean(i.email),status}})]);return json({ok:true});}
function familyAccessView(row){return {id:row.id,userId:row.user_id,clientId:row.client_id,displayName:row.display_name,email:row.email,userStatus:row.user_status||'active',clientName:[row.preferred_name||row.first_name,row.last_name].filter(Boolean).join(' '),status:row.status,relationship:row.relationship_label||'',canViewProfile:Boolean(row.can_view_profile),canViewVisits:Boolean(row.can_view_visits),canViewCareUpdates:Boolean(row.can_view_care_updates),canViewDocuments:Boolean(row.can_view_documents),canViewMedication:Boolean(row.can_view_medication),canViewCarePlan:Boolean(row.can_view_care_plan),canMessageTeam:Boolean(row.can_message_team),consentBasis:row.consent_basis||'',consentRecordedAt:row.consent_recorded_at||null,accessReviewDate:row.access_review_date||null,reviewState:familyAccessReviewState(row.access_review_date),revokedAt:row.revoked_at||null,createdAt:row.created_at};}
async function listFamilyAccess(db,session){
  const branch=activeBranch(session),restricted=branchRestricted(session);
  const r=await db.prepare(`SELECT f.*,u.display_name,u.email,u.status user_status,c.first_name,c.last_name,c.preferred_name FROM family_client_access f JOIN users u ON u.id=f.user_id AND u.organisation_id=f.organisation_id JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.organisation_id=? ${restricted?'AND c.branch_id=?':''} ORDER BY CASE f.status WHEN 'active' THEN 0 ELSE 1 END,u.display_name,c.last_name`).bind(session.organisation_id,...(restricted?[branch]:[])).all();
  return json({links:(r.results||[]).map(familyAccessView)});
}
async function listFamilyAccounts(db,session){
  const branch=activeBranch(session),restricted=branchRestricted(session);
  const r=await db.prepare(`SELECT DISTINCT u.id,u.email,u.display_name,u.role,u.access_level,u.home_branch_id,u.status,u.must_change_password,u.last_login_at,u.created_at FROM users u LEFT JOIN family_client_access f ON f.user_id=u.id AND f.organisation_id=u.organisation_id LEFT JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE u.organisation_id=? AND u.access_level='family' ${restricted?'AND (u.home_branch_id=? OR c.branch_id=?)':''} ORDER BY CASE u.status WHEN 'active' THEN 0 ELSE 1 END,u.display_name COLLATE NOCASE`).bind(session.organisation_id,...(restricted?[branch,branch]:[])).all();
  return json({accounts:(r.results||[]).map(toUser)});
}
function strongTemporaryPassword(password){return password.length>=12&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/[0-9]/.test(password);}
async function createFamilyAccount(request,env,session){
  const db=env.DB;
  const input=await readJson(request),email=clean(input.email).toLowerCase(),name=clean(input.displayName),password=String(input.temporaryPassword||''),clientId=clean(input.clientId),flags=normaliseFamilyPortalAccess(input),consentBasis=clean(input.consentBasis).slice(0,1000);
  if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!strongTemporaryPassword(password)||consentBasis.length<8||flags.relationship.length<2||!/^\d{4}-\d{2}-\d{2}$/.test(flags.accessReviewDate))return json({error:{code:'VALIDATION_ERROR',message:'Enter a name, valid email, relationship, access review date, strong temporary password and a clear authority or consent basis.'}},400);
  const restricted=branchRestricted(session),branch=activeBranch(session);
  const client=await db.prepare(`SELECT id,branch_id FROM clients WHERE id=? AND organisation_id=? ${restricted?'AND branch_id=?':''} AND archived_at IS NULL`).bind(clientId,session.organisation_id,...(restricted?[branch]:[])).first();
  if(!client)return json({error:{code:'VALIDATION_ERROR',message:'Choose an active client from this organisation or branch.'}},400);
  const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;
  const secured=await hashPassword(password),userId=crypto.randomUUID(),accessId=crypto.randomUUID(),role=legacyRole('family');
  try{
    await db.batch([
      db.prepare("INSERT INTO users (id,organisation_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,'family',?,?,?,?, 'active',1)").bind(userId,session.organisation_id,email,name,role,client.branch_id||null,secured.hash,secured.salt,PASSWORD_ITERATIONS),
      db.prepare("INSERT INTO family_client_access(id,organisation_id,user_id,client_id,can_view_profile,can_view_visits,can_view_care_updates,can_view_documents,can_view_medication,can_view_care_plan,can_message_team,relationship_label,access_review_date,status,consent_basis,consent_recorded_at,consent_recorded_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP)").bind(accessId,session.organisation_id,userId,client.id,flags.canViewProfile?1:0,flags.canViewVisits?1:0,flags.canViewCareUpdates?1:0,flags.canViewDocuments?1:0,flags.canViewMedication?1:0,flags.canViewCarePlan?1:0,flags.canMessageTeam?1:0,flags.relationship,flags.accessReviewDate,consentBasis,session.user_id),
      auditStatement(db,session.organisation_id,session.user_id,'family.account_created','user',userId,{email,clientId:client.id}),
      auditStatement(db,session.organisation_id,session.user_id,'family.access_granted','family_client_access',accessId,{userId,clientId:client.id,...flags,consentBasisRecorded:true})
    ]);
  }catch(error){if(String(error).includes('UNIQUE'))return json({error:{code:'EMAIL_EXISTS',message:'A user with that email already exists.'}},409);throw error;}
  const emailDelivery=await sendCareAccountEmail(env,session,{templateKey:'account_invitation',sourceEventId:`care-family:${userId}:created`,userId,recipientEmail:email,recipientName:name,accessLabel:'Family portal',temporaryPassword:password});
  return json({account:{id:userId,email,displayName:name,role,accessLevel:'family',branchId:client.branch_id||null,status:'active',mustChangePassword:true},access:{id:accessId,userId,clientId:client.id,consentBasis,...flags},emailDelivery},201);
}
async function updateFamilyAccount(request,env,session,id){
  const db=env.DB;
  const input=await readJson(request),name=clean(input.displayName),status=clean(input.status),password=String(input.temporaryPassword||''),restricted=branchRestricted(session),branch=activeBranch(session);
  if(!name||!['active','disabled'].includes(status)||(password&&!strongTemporaryPassword(password)))return json({error:{code:'VALIDATION_ERROR',message:'Enter a name and valid status. A new temporary password must have at least 12 characters with upper-case, lower-case and a number.'}},400);
  const account=await db.prepare(`SELECT u.id,u.email,u.status FROM users u WHERE u.id=? AND u.organisation_id=? AND u.access_level='family' ${restricted?'AND (u.home_branch_id=? OR EXISTS (SELECT 1 FROM family_client_access f JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.user_id=u.id AND f.organisation_id=u.organisation_id AND c.branch_id=?))':''}`).bind(id,session.organisation_id,...(restricted?[branch,branch]:[])).first();
  if(!account)return notFound('Family account');
  if(status==='active'&&account.status!=='active'){const limitError=await subscriptionResourceLimitGuard(env,session.organisation_id,'users');if(limitError)return limitError;}
  const statements=[];
  if(password){const secured=await hashPassword(password);statements.push(db.prepare("UPDATE users SET display_name=?,status=?,password_hash=?,password_salt=?,password_iterations=?,must_change_password=1,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND access_level='family'").bind(name,status,secured.hash,secured.salt,PASSWORD_ITERATIONS,id,session.organisation_id));}
  else statements.push(db.prepare("UPDATE users SET display_name=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=? AND access_level='family'").bind(name,status,id,session.organisation_id));
  if(status==='disabled'||password)statements.push(db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'family.account_updated','user',id,{email:account.email,status,passwordReset:Boolean(password)}));
  await db.batch(statements);
  const emailDelivery=password?await sendCareAccountEmail(env,session,{templateKey:'password_reset',sourceEventId:`care-family:${id}:password-reset:${crypto.randomUUID()}`,userId:id,recipientEmail:account.email,recipientName:name,accessLabel:'Family portal',temporaryPassword:password}):null;
  return json({ok:true,emailDelivery});
}
async function saveFamilyAccess(request,db,session){
  const i=await readJson(request),userId=clean(i.userId),clientId=clean(i.clientId),flags=normaliseFamilyPortalAccess(i),consentBasis=clean(i.consentBasis).slice(0,1000);
  if(consentBasis.length<8||flags.relationship.length<2||!/^\d{4}-\d{2}-\d{2}$/.test(flags.accessReviewDate))return json({error:{code:'VALIDATION_ERROR',message:'Record the family relationship, review date and authority or consent basis before granting access.'}},400);
  const restricted=branchRestricted(session),branch=activeBranch(session);
  const user=await db.prepare(`SELECT u.id FROM users u WHERE u.id=? AND u.organisation_id=? AND u.access_level='family' AND u.status='active' ${restricted?'AND (u.home_branch_id=? OR EXISTS (SELECT 1 FROM family_client_access f JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.user_id=u.id AND f.organisation_id=u.organisation_id AND c.branch_id=?))':''}`).bind(userId,session.organisation_id,...(restricted?[branch,branch]:[])).first(),client=await db.prepare(`SELECT id FROM clients WHERE id=? AND organisation_id=? ${restricted?'AND branch_id=?':''} AND archived_at IS NULL`).bind(clientId,session.organisation_id,...(restricted?[branch]:[])).first();
  if(!user||!client)return json({error:{code:"VALIDATION_ERROR",message:"Choose an active family user and client from this organisation or branch."}},400);
  const existing=await db.prepare(`SELECT id FROM family_client_access WHERE organisation_id=? AND user_id=? AND client_id=?`).bind(session.organisation_id,userId,clientId).first(),id=existing?.id||crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO family_client_access(id,organisation_id,user_id,client_id,can_view_profile,can_view_visits,can_view_care_updates,can_view_documents,can_view_medication,can_view_care_plan,can_message_team,relationship_label,access_review_date,status,consent_basis,consent_recorded_at,consent_recorded_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,client_id) DO UPDATE SET can_view_profile=excluded.can_view_profile,can_view_visits=excluded.can_view_visits,can_view_care_updates=excluded.can_view_care_updates,can_view_documents=excluded.can_view_documents,can_view_medication=excluded.can_view_medication,can_view_care_plan=excluded.can_view_care_plan,can_message_team=excluded.can_message_team,relationship_label=excluded.relationship_label,access_review_date=excluded.access_review_date,status='active',consent_basis=excluded.consent_basis,consent_recorded_at=CURRENT_TIMESTAMP,consent_recorded_by=excluded.consent_recorded_by,revoked_at=NULL,revoked_by=NULL,revoke_reason='',updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,userId,clientId,flags.canViewProfile?1:0,flags.canViewVisits?1:0,flags.canViewCareUpdates?1:0,flags.canViewDocuments?1:0,flags.canViewMedication?1:0,flags.canViewCarePlan?1:0,flags.canMessageTeam?1:0,flags.relationship,flags.accessReviewDate,consentBasis,session.user_id),
    auditStatement(db,session.organisation_id,session.user_id,existing?'family.access_updated':'family.access_granted','family_client_access',id,{userId,clientId,...flags,consentBasisRecorded:true})
  ]);
  return json({ok:true,id,consentBasis,flags},existing?200:201);
}
async function revokeFamilyAccess(request,db,session,id){
  const input=await readJson(request),reason=clean(input.reason).slice(0,1000);
  if(reason.length<8)return json({error:{code:'REASON_REQUIRED',message:'Record why this family access is being revoked.'}},400);
  const restricted=branchRestricted(session),branch=activeBranch(session);
  const row=await db.prepare(`SELECT f.id,f.user_id,f.client_id FROM family_client_access f JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.id=? AND f.organisation_id=? ${restricted?'AND c.branch_id=?':''}`).bind(id,session.organisation_id,...(restricted?[branch]:[])).first();if(!row)return notFound('Family access');
  await db.batch([db.prepare(`UPDATE family_client_access SET status='revoked',revoked_at=CURRENT_TIMESTAMP,revoked_by=?,revoke_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(session.user_id,reason,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'family.access_revoked','family_client_access',id,{userId:row.user_id,clientId:row.client_id,reason})]);return json({ok:true});
}
function familyPreferenceView(row={}){return {inAppNotifications:row.in_app_notifications===undefined?true:Boolean(row.in_app_notifications),emailNotifications:row.email_notifications===undefined?true:Boolean(row.email_notifications),visitNotifications:row.visit_notifications===undefined?true:Boolean(row.visit_notifications),careUpdateNotifications:row.care_update_notifications===undefined?true:Boolean(row.care_update_notifications),documentNotifications:row.document_notifications===undefined?true:Boolean(row.document_notifications),messageNotifications:row.message_notifications===undefined?true:Boolean(row.message_notifications),digestFrequency:row.digest_frequency||'immediate'};}
function familyNotificationStatement(db,organisationId,userId,clientId,type,title,body,relatedType,relatedId){return db.prepare(`INSERT INTO family_notifications(id,organisation_id,user_id,client_id,notification_type,title,body,related_type,related_id) SELECT ?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT CASE ? WHEN 'care_update' THEN care_update_notifications WHEN 'document' THEN document_notifications WHEN 'message' THEN message_notifications WHEN 'visit' THEN visit_notifications ELSE in_app_notifications END FROM family_portal_preferences WHERE organisation_id=? AND user_id=?),1)=1 AND COALESCE((SELECT in_app_notifications FROM family_portal_preferences WHERE organisation_id=? AND user_id=?),1)=1`).bind(crypto.randomUUID(),organisationId,userId,clientId||null,type,title,body||'',relatedType||null,relatedId||null,type,organisationId,userId,organisationId,userId);}
async function requireFamilyManager(db,session){return session.access_level!=='family'&&await userHasPermission(db,session,'family_portal.manage');}

async function getFamilyPreferences(db,session){
  if(session.access_level!=='family')return forbidden();
  const row=await db.prepare('SELECT * FROM family_portal_preferences WHERE organisation_id=? AND user_id=?').bind(session.organisation_id,session.user_id).first();
  return json({preferences:familyPreferenceView(row||{})});
}
async function updateFamilyPreferences(request,db,session){
  if(session.access_level!=='family')return forbidden();
  const value=normaliseFamilyPreferences(await readJson(request));
  await db.batch([
    db.prepare(`INSERT INTO family_portal_preferences(user_id,organisation_id,in_app_notifications,email_notifications,visit_notifications,care_update_notifications,document_notifications,message_notifications,digest_frequency) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET in_app_notifications=excluded.in_app_notifications,email_notifications=excluded.email_notifications,visit_notifications=excluded.visit_notifications,care_update_notifications=excluded.care_update_notifications,document_notifications=excluded.document_notifications,message_notifications=excluded.message_notifications,digest_frequency=excluded.digest_frequency,updated_at=CURRENT_TIMESTAMP`).bind(session.user_id,session.organisation_id,value.inAppNotifications?1:0,value.emailNotifications?1:0,value.visitNotifications?1:0,value.careUpdateNotifications?1:0,value.documentNotifications?1:0,value.messageNotifications?1:0,value.digestFrequency),
    auditStatement(db,session.organisation_id,session.user_id,'family.preferences_updated','user',session.user_id,{digestFrequency:value.digestFrequency})
  ]);
  return json({ok:true,preferences:value});
}
async function readFamilyNotification(db,session,id){
  if(session.access_level!=='family')return forbidden();
  const result=await db.prepare('UPDATE family_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND organisation_id=? AND user_id=?').bind(id,session.organisation_id,session.user_id).run();
  if(!result.meta.changes)return notFound('Notification');
  return json({ok:true});
}
async function readAllFamilyNotifications(db,session){
  if(session.access_level!=='family')return forbidden();
  await db.prepare('UPDATE family_notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE organisation_id=? AND user_id=?').bind(session.organisation_id,session.user_id).run();
  return json({ok:true});
}

async function listFamilyMessages(db,session){
  const family=session.access_level==='family',branch=activeBranch(session),restricted=branchRestricted(session);
  if(!family&&!await requireFamilyManager(db,session))return forbidden();
  const familyWhere=`t.organisation_id=? AND t.family_user_id=? AND f.status='active'`;
  const managerWhere=`t.organisation_id=? ${restricted?'AND t.branch_id=?':''}`;
  const params=family?[session.organisation_id,session.user_id]:[session.organisation_id,...(restricted?[branch]:[])];
  const where=family?familyWhere:managerWhere;
  const threads=await db.prepare(`SELECT t.*,c.first_name,c.last_name,c.preferred_name,u.display_name family_name,u.email family_email,(SELECT COUNT(*) FROM family_messages um WHERE um.thread_id=t.id AND um.organisation_id=t.organisation_id AND um.sender_role='family' AND um.read_by_team_at IS NULL) unread_team,(SELECT COUNT(*) FROM family_messages uf WHERE uf.thread_id=t.id AND uf.organisation_id=t.organisation_id AND uf.sender_role='care_team' AND uf.read_by_family_at IS NULL) unread_family FROM family_message_threads t JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id JOIN users u ON u.id=t.family_user_id AND u.organisation_id=t.organisation_id ${family?'JOIN family_client_access f ON f.id=t.access_id AND f.organisation_id=t.organisation_id':''} WHERE ${where} ORDER BY datetime(t.last_message_at) DESC LIMIT 100`).bind(...params).all();
  const messages=await db.prepare(`SELECT m.*,u.display_name sender_name FROM family_messages m JOIN users u ON u.id=m.sender_user_id AND u.organisation_id=m.organisation_id JOIN family_message_threads t ON t.id=m.thread_id AND t.organisation_id=m.organisation_id ${family?'JOIN family_client_access f ON f.id=t.access_id AND f.organisation_id=t.organisation_id':''} WHERE ${where} ORDER BY datetime(m.created_at) LIMIT 500`).bind(...params).all();
  return json({threads:threads.results||[],messages:messages.results||[]});
}
async function saveFamilyMessage(request,db,session){
  const input=await readJson(request),threadId=clean(input.threadId),validated=validateFamilyMessage(input);
  if(validated.error)return json({error:{code:'VALIDATION_ERROR',message:validated.error}},400);
  const value=validated.value,family=session.access_level==='family',manager=!family&&await requireFamilyManager(db,session);
  if(!family&&!manager)return forbidden();
  if(threadId){
    const branch=activeBranch(session),restricted=branchRestricted(session);
    const thread=await db.prepare(`SELECT t.*,f.status access_status,f.can_message_team FROM family_message_threads t JOIN family_client_access f ON f.id=t.access_id AND f.organisation_id=t.organisation_id WHERE t.id=? AND t.organisation_id=? ${family?"AND t.family_user_id=? AND f.status='active' AND f.can_message_team=1":restricted?'AND t.branch_id=?':''}`).bind(threadId,session.organisation_id,...(family?[session.user_id]:restricted?[branch]:[])).first();
    if(!thread)return notFound('Conversation');
    if(thread.status==='closed')return json({error:{code:'THREAD_CLOSED',message:'This conversation is closed. Start a new message if you still need help.'}},409);
    const id=crypto.randomUUID(),senderRole=family?'family':'care_team',statements=[
      db.prepare(`INSERT INTO family_messages(id,organisation_id,thread_id,sender_user_id,sender_role,body,read_by_family_at,read_by_team_at) VALUES(?,?,?,?,?,?,${family?'CURRENT_TIMESTAMP':'NULL'},${family?'NULL':'CURRENT_TIMESTAMP'})`).bind(id,session.organisation_id,threadId,session.user_id,senderRole,value.body),
      db.prepare('UPDATE family_message_threads SET last_message_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(threadId,session.organisation_id),
      auditStatement(db,session.organisation_id,session.user_id,'family.message_sent','family_message',id,{threadId,senderRole})
    ];
    if(!family)statements.push(familyNotificationStatement(db,session.organisation_id,thread.family_user_id,thread.client_id,'message','New reply from your care team',value.body.slice(0,180),'thread',threadId));
    await db.batch(statements);return json({ok:true,id},201);
  }
  if(!family)return json({error:{code:'VALIDATION_ERROR',message:'Select an existing family conversation to reply.'}},400);
  const clientId=clean(input.clientId),link=await db.prepare(`SELECT f.id,f.client_id,c.branch_id FROM family_client_access f JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.client_id=? AND f.status='active' AND f.can_message_team=1 AND c.archived_at IS NULL`).bind(session.organisation_id,session.user_id,clientId).first();
  if(!link)return forbidden('Messaging is not enabled for this family link.');
  const newThreadId=crypto.randomUUID(),messageId=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO family_message_threads(id,organisation_id,branch_id,client_id,access_id,family_user_id,subject,category,priority,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(newThreadId,session.organisation_id,link.branch_id||null,clientId,link.id,session.user_id,value.subject,value.category,value.priority,session.user_id),
    db.prepare(`INSERT INTO family_messages(id,organisation_id,thread_id,sender_user_id,sender_role,body,read_by_family_at) VALUES(?,?,?,?,? ,?,CURRENT_TIMESTAMP)`).bind(messageId,session.organisation_id,newThreadId,session.user_id,'family',value.body),
    auditStatement(db,session.organisation_id,session.user_id,'family.conversation_started','family_message_thread',newThreadId,{clientId,category:value.category,priority:value.priority})
  ]);
  return json({ok:true,id:newThreadId},201);
}
async function updateFamilyMessageThread(request,db,session,id){
  const input=await readJson(request),family=session.access_level==='family',manager=!family&&await requireFamilyManager(db,session),branch=activeBranch(session),restricted=branchRestricted(session);
  if(!family&&!manager)return forbidden();
  const thread=await db.prepare(`SELECT t.id FROM family_message_threads t JOIN family_client_access f ON f.id=t.access_id AND f.organisation_id=t.organisation_id WHERE t.id=? AND t.organisation_id=? ${family?"AND t.family_user_id=? AND f.status='active'":restricted?'AND t.branch_id=?':''}`).bind(id,session.organisation_id,...(family?[session.user_id]:restricted?[branch]:[])).first();
  if(!thread)return notFound('Conversation');
  const status=clean(input.status);
  const statements=[];
  if(family)statements.push(db.prepare(`UPDATE family_messages SET read_by_family_at=COALESCE(read_by_family_at,CURRENT_TIMESTAMP) WHERE organisation_id=? AND thread_id=? AND sender_role='care_team'`).bind(session.organisation_id,id));
  else {
    statements.push(db.prepare(`UPDATE family_messages SET read_by_team_at=COALESCE(read_by_team_at,CURRENT_TIMESTAMP) WHERE organisation_id=? AND thread_id=? AND sender_role='family'`).bind(session.organisation_id,id));
    if(status){if(!['open','closed'].includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Choose open or closed.'}},400);statements.push(db.prepare('UPDATE family_message_threads SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(status,id,session.organisation_id));}
  }
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'family.conversation_updated','family_message_thread',id,{status:status||null,reader:family?'family':'care_team'}));
  await db.batch(statements);return json({ok:true});
}

async function familyManagementHub(db,session){
  const branch=activeBranch(session),restricted=branchRestricted(session),params=[session.organisation_id,...(restricted?[branch]:[])];
  const [updates,documents,shares,threads]=await Promise.all([
    db.prepare(`SELECT u.*,c.first_name,c.last_name,c.preferred_name,p.display_name published_by_name FROM family_shared_updates u JOIN clients c ON c.id=u.client_id AND c.organisation_id=u.organisation_id LEFT JOIN users p ON p.id=u.published_by AND p.organisation_id=u.organisation_id WHERE u.organisation_id=? ${restricted?'AND u.branch_id=?':''} ORDER BY datetime(u.published_at) DESC LIMIT 100`).bind(...params).all(),
    db.prepare(`SELECT d.id,d.client_id,d.name,d.document_type,d.document_date,d.status,c.first_name,c.last_name,c.preferred_name FROM client_documents d JOIN clients c ON c.id=d.client_id AND c.organisation_id=d.organisation_id WHERE d.organisation_id=? AND d.status!='Archived' ${restricted?'AND d.branch_id=?':''} ORDER BY COALESCE(d.document_date,d.created_at) DESC LIMIT 200`).bind(...params).all(),
    db.prepare(`SELECT s.*,f.user_id,f.client_id,u.display_name family_name,d.name document_name FROM family_document_shares s JOIN family_client_access f ON f.id=s.access_id AND f.organisation_id=s.organisation_id JOIN users u ON u.id=f.user_id AND u.organisation_id=f.organisation_id JOIN client_documents d ON d.id=s.document_id AND d.organisation_id=s.organisation_id JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE s.organisation_id=? ${restricted?'AND c.branch_id=?':''} ORDER BY datetime(s.shared_at) DESC`).bind(...params).all(),
    db.prepare(`SELECT t.*,c.first_name,c.last_name,c.preferred_name,u.display_name family_name,u.email family_email,(SELECT COUNT(*) FROM family_messages m WHERE m.thread_id=t.id AND m.sender_role='family' AND m.read_by_team_at IS NULL) unread_team FROM family_message_threads t JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id JOIN users u ON u.id=t.family_user_id AND u.organisation_id=t.organisation_id WHERE t.organisation_id=? ${restricted?'AND t.branch_id=?':''} ORDER BY datetime(t.last_message_at) DESC LIMIT 100`).bind(...params).all()
  ]);
  return json({updates:updates.results||[],documents:documents.results||[],documentShares:shares.results||[],threads:threads.results||[],summary:{publishedUpdates:(updates.results||[]).filter(row=>row.status==='published').length,sharedDocuments:(shares.results||[]).filter(row=>row.status==='active').length,openThreads:(threads.results||[]).filter(row=>row.status==='open').length,unreadMessages:(threads.results||[]).reduce((sum,row)=>sum+Number(row.unread_team||0),0)}});
}
async function publishFamilyUpdate(request,db,session){
  const input=await readJson(request),clientId=clean(input.clientId),visitId=clean(input.visitId)||null,validated=validateFamilyUpdate(input);
  if(validated.error)return json({error:{code:'VALIDATION_ERROR',message:validated.error}},400);
  const client=await ensureClient(db,session,clientId);if(!client)return notFound('Client');
  if(visitId){const visit=await db.prepare('SELECT id FROM care_visits WHERE id=? AND client_id=? AND organisation_id=?').bind(visitId,clientId,session.organisation_id).first();if(!visit)return json({error:{code:'VALIDATION_ERROR',message:'The selected visit does not belong to this client.'}},400);}
  const value=validated.value,id=crypto.randomUUID(),recipients=await db.prepare(`SELECT user_id FROM family_client_access WHERE organisation_id=? AND client_id=? AND status='active' AND can_view_care_updates=1 LIMIT 75`).bind(session.organisation_id,clientId).all();
  const statements=[db.prepare(`INSERT INTO family_shared_updates(id,organisation_id,branch_id,client_id,visit_id,title,summary,category,mood,published_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,client.branch_id||null,clientId,visitId,value.title,value.summary,value.category,value.mood,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'family.update_published','family_shared_update',id,{clientId,visitId,category:value.category})];
  for(const recipient of recipients.results||[])statements.push(familyNotificationStatement(db,session.organisation_id,recipient.user_id,clientId,'care_update',value.title,value.summary.slice(0,180),'update',id));
  await db.batch(statements);return json({ok:true,id,notified:(recipients.results||[]).length},201);
}
async function withdrawFamilyUpdate(db,session,id){
  const branch=activeBranch(session),restricted=branchRestricted(session),row=await db.prepare(`SELECT id,client_id FROM family_shared_updates WHERE id=? AND organisation_id=? ${restricted?'AND branch_id=?':''}`).bind(id,session.organisation_id,...(restricted?[branch]:[])).first();if(!row)return notFound('Family update');
  await db.batch([db.prepare(`UPDATE family_shared_updates SET status='withdrawn',withdrawn_by=?,withdrawn_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(session.user_id,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'family.update_withdrawn','family_shared_update',id,{clientId:row.client_id})]);return json({ok:true});
}
async function shareFamilyDocument(request,db,session,documentId){
  const input=await readJson(request),accessId=clean(input.accessId),branch=activeBranch(session),restricted=branchRestricted(session);
  const row=await db.prepare(`SELECT f.id access_id,f.user_id,f.client_id,d.id document_id,d.name,c.branch_id FROM family_client_access f JOIN client_documents d ON d.client_id=f.client_id AND d.organisation_id=f.organisation_id JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.id=? AND d.id=? AND f.organisation_id=? AND f.status='active' AND f.can_view_documents=1 AND d.status!='Archived' ${restricted?'AND c.branch_id=?':''}`).bind(accessId,documentId,session.organisation_id,...(restricted?[branch]:[])).first();
  if(!row)return json({error:{code:'VALIDATION_ERROR',message:'Choose an active family link with document access for this client.'}},400);
  const existing=await db.prepare('SELECT id FROM family_document_shares WHERE organisation_id=? AND access_id=? AND document_id=?').bind(session.organisation_id,accessId,documentId).first(),id=existing?.id||crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO family_document_shares(id,organisation_id,access_id,document_id,status,shared_by) VALUES(?,?,?,?,'active',?) ON CONFLICT(access_id,document_id) DO UPDATE SET status='active',shared_by=excluded.shared_by,shared_at=CURRENT_TIMESTAMP,revoked_by=NULL,revoked_at=NULL,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,accessId,documentId,session.user_id),
    familyNotificationStatement(db,session.organisation_id,row.user_id,row.client_id,'document',`Document shared: ${row.name}`,'A new document is available in your family portal.','document',documentId),
    auditStatement(db,session.organisation_id,session.user_id,'family.document_shared','family_document_share',id,{accessId,documentId})
  ]);
  return json({ok:true,id},existing?200:201);
}
async function unshareFamilyDocument(request,db,session,documentId){
  const input=await readJson(request),accessId=clean(input.accessId),branch=activeBranch(session),restricted=branchRestricted(session);
  const row=await db.prepare(`SELECT s.id FROM family_document_shares s JOIN family_client_access f ON f.id=s.access_id AND f.organisation_id=s.organisation_id JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE s.organisation_id=? AND s.document_id=? AND s.access_id=? ${restricted?'AND c.branch_id=?':''}`).bind(session.organisation_id,documentId,accessId,...(restricted?[branch]:[])).first();if(!row)return notFound('Document share');
  await db.batch([db.prepare(`UPDATE family_document_shares SET status='revoked',revoked_by=?,revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(session.user_id,row.id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'family.document_unshared','family_document_share',row.id,{accessId,documentId})]);return json({ok:true});
}

async function familyPortal(db,session){
  if(session.access_level!=='family')return forbidden();
  const org=session.organisation_id,user=session.user_id;
  const [links,visits,updates,documents,medications,carePlans,notifications,preferences,messages]=await Promise.all([
    db.prepare(`SELECT f.*,c.first_name,c.last_name,c.preferred_name,c.town,c.care_package,c.next_review,c.status client_status FROM family_client_access f JOIN clients c ON c.id=f.client_id AND c.organisation_id=f.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.status='active' AND c.archived_at IS NULL ORDER BY c.last_name,c.first_name`).bind(org,user).all(),
    db.prepare(`SELECT v.id,v.client_id,v.visit_type,v.scheduled_start,v.scheduled_end,v.status,v.actual_start,v.actual_end,c.first_name,c.last_name,c.preferred_name,s.first_name staff_first_name,s.last_name staff_last_name,s.preferred_name staff_preferred_name FROM family_client_access f JOIN care_visits v ON v.client_id=f.client_id AND v.organisation_id=f.organisation_id JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.status='active' AND f.can_view_visits=1 AND COALESCE(v.rota_status,'published')='published' AND v.status!='cancelled' AND datetime(v.scheduled_start)>=datetime('now','-14 days') ORDER BY datetime(v.scheduled_start) DESC LIMIT 100`).bind(org,user).all(),
    db.prepare(`SELECT u.id,u.client_id,u.visit_id,u.title,u.summary,u.category,u.mood,u.published_at,p.display_name published_by_name FROM family_client_access f JOIN family_shared_updates u ON u.client_id=f.client_id AND u.organisation_id=f.organisation_id LEFT JOIN users p ON p.id=u.published_by AND p.organisation_id=u.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.status='active' AND f.can_view_care_updates=1 AND u.status='published' ORDER BY datetime(u.published_at) DESC LIMIT 100`).bind(org,user).all(),
    db.prepare(`SELECT d.id,d.client_id,d.name,d.document_type,d.document_date,d.review_date,d.reference_url,d.notes,d.status,d.storage_key FROM family_client_access f JOIN family_document_shares s ON s.access_id=f.id AND s.organisation_id=f.organisation_id AND s.status='active' JOIN client_documents d ON d.id=s.document_id AND d.organisation_id=s.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.status='active' AND f.can_view_documents=1 AND d.status!='Archived' ORDER BY COALESCE(d.document_date,d.created_at) DESC LIMIT 100`).bind(org,user).all(),
    db.prepare(`SELECT m.id,m.client_id,m.name,m.strength,m.form,m.route,m.dose,m.instructions,m.frequency,m.scheduled_times_json,m.start_date,m.end_date,m.is_prn,m.prn_protocol,m.status FROM family_client_access f JOIN medications m ON m.client_id=f.client_id AND m.organisation_id=f.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.status='active' AND f.can_view_medication=1 AND m.status='active' ORDER BY m.name LIMIT 100`).bind(org,user).all(),
    db.prepare(`SELECT cp.id,cp.client_id,cp.title,cp.version,cp.plan_type,cp.plan_summary,cp.what_matters,cp.preferences,cp.effective_date,cp.review_date,cp.approved_at FROM family_client_access f JOIN care_plans cp ON cp.client_id=f.client_id AND cp.organisation_id=f.organisation_id WHERE f.organisation_id=? AND f.user_id=? AND f.status='active' AND f.can_view_care_plan=1 AND cp.status='Active' AND cp.approval_status='approved' ORDER BY datetime(cp.approved_at) DESC LIMIT 20`).bind(org,user).all(),
    db.prepare(`SELECT id,client_id,notification_type,title,body,related_type,related_id,read_at,created_at FROM family_notifications WHERE organisation_id=? AND user_id=? ORDER BY datetime(created_at) DESC LIMIT 50`).bind(org,user).all(),
    db.prepare('SELECT * FROM family_portal_preferences WHERE organisation_id=? AND user_id=?').bind(org,user).first(),
    listFamilyMessages(db,session)
  ]);
  const access=(links.results||[]).map(row=>({id:row.id,clientId:row.client_id,clientName:[row.preferred_name||row.first_name,row.last_name].filter(Boolean).join(' '),relationship:row.relationship_label||'',accessReviewDate:row.access_review_date||null,reviewState:familyAccessReviewState(row.access_review_date),profile:row.can_view_profile?{town:row.town||'',carePackage:row.care_package||'',nextReview:row.next_review||'',status:row.client_status}:null,permissions:{profile:Boolean(row.can_view_profile),visits:Boolean(row.can_view_visits),careUpdates:Boolean(row.can_view_care_updates),documents:Boolean(row.can_view_documents),medication:Boolean(row.can_view_medication),carePlan:Boolean(row.can_view_care_plan),messages:Boolean(row.can_message_team)}}));
  await audit(db,org,user,'family.portal_viewed','family_portal',user,{linkedClients:access.length});
  const sharedDocuments=(documents.results||[]).map(({storage_key,...row})=>({...row,reference_url:storage_key?`/api/documents/${encodeURIComponent(row.id)}/file`:row.reference_url,stored_file:Boolean(storage_key)}));
  const messagePayload=await messages.json();
  return json({clients:access,visits:visits.results||[],careUpdates:updates.results||[],documents:sharedDocuments,medications:medications.results||[],carePlans:carePlans.results||[],notifications:notifications.results||[],preferences:familyPreferenceView(preferences||{}),threads:messagePayload.threads||[],messages:messagePayload.messages||[],generatedAt:new Date().toISOString()});
}


// Sprint 12 — completed enterprise security services
async function launchGovernanceAccess(db,session){
  const administrator=canManageSecurity(session);
  const canView=administrator||await userHasPermission(db,session,'governance.launch.view');
  const canManage=administrator||await userHasPermission(db,session,'governance.launch.manage');
  const canApprove=administrator||await userHasPermission(db,session,'governance.launch.approve');
  return {canView,canManage,canApprove};
}

function launchGovernanceOutput(definition,record={},states=[]){
  const byKey=new Map(states.map(state=>[state.check_key,state]));
  const checks=definition.checks.map(([key,label])=>{
    const state=byKey.get(key)||{};
    return {key,label,completed:Boolean(state.completed),evidenceNote:state.evidence_note||'',completedBy:state.completed_by_name||'',completedAt:state.completed_at||null};
  });
  const status=deriveLaunchDomainStatus(record,checks);
  return {
    key:definition.key,title:definition.title,description:definition.description,status,
    ownerName:record.owner_name||'',ownerRole:record.owner_role||'',evidenceSummary:record.evidence_summary||'',evidenceReference:record.evidence_reference||'',
    approvedByName:record.approved_by_name||'',approvedByRole:record.approved_by_role||'',approvedAt:record.approved_at||null,reviewDueAt:record.review_due_at||null,
    updatedAt:record.updated_at||null,checks,completedChecks:checks.filter(check=>check.completed).length,totalChecks:checks.length
  };
}

async function getLaunchGovernance(env,session){
  const db=env.DB,access=await launchGovernanceAccess(db,session);
  if(!access.canView)return forbidden();
  const [recordsResult,checksResult,branchGuards,unsupportedPolicy,admins,passwords,maintenance]=await Promise.all([
    db.prepare('SELECT * FROM organisation_launch_governance WHERE organisation_id=? ORDER BY domain_key').bind(session.organisation_id).all(),
    db.prepare(`SELECT c.*,u.display_name completed_by_name FROM organisation_launch_governance_checks c LEFT JOIN users u ON u.id=c.completed_by WHERE c.organisation_id=? ORDER BY c.domain_key,c.check_key`).bind(session.organisation_id).all(),
    db.prepare("SELECT COUNT(*) total FROM sqlite_master WHERE type='trigger' AND name LIKE 'branch_guard_%'").first(),
    db.prepare('SELECT COUNT(*) total FROM organisation_security_policies WHERE organisation_id=? AND (require_mfa<>0 OR require_trusted_device<>0 OR allow_password_login<>1)').bind(session.organisation_id).first(),
    db.prepare("SELECT COUNT(*) total FROM users WHERE organisation_id=? AND status='active' AND access_level IN ('platform_owner','organisation_owner','organisation_admin','branch_manager')").bind(session.organisation_id).first(),
    db.prepare("SELECT COUNT(*) total FROM users WHERE organisation_id=? AND status='active' AND access_level!='family' AND must_change_password=1").bind(session.organisation_id).first(),
    db.prepare("SELECT status,last_started_at,last_completed_at,error_message FROM system_maintenance_state WHERE job_key='hourly'").first()
  ]);
  const recordMap=new Map((recordsResult.results||[]).map(record=>[record.domain_key,record]));
  const allChecks=checksResult.results||[];
  const domains=LAUNCH_GOVERNANCE_DOMAINS.map(definition=>launchGovernanceOutput(definition,recordMap.get(definition.key),allChecks.filter(state=>state.domain_key===definition.key)));
  const overallStatus=deriveOverallLaunchStatus(domains),approved=domains.filter(domain=>domain.status==='approved').length,ready=domains.filter(domain=>domain.status==='ready_for_signoff').length;
  const technicalEvidence=[
    {key:'release',label:'Release version',passed:true,detail:`CoreCare Care ${VERSION}`},
    {key:'database',label:'Production database binding',passed:Boolean(env.DB),detail:env.DB?'Configured':'Not configured'},
    {key:'storage',label:'Private document storage',passed:Boolean(env.CLIENT_FILES),detail:env.CLIENT_FILES?'R2 binding configured':'R2 binding missing'},
    {key:'branch_guards',label:'Database branch safeguards',passed:Number(branchGuards?.total||0)>=14,detail:`${Number(branchGuards?.total||0)} active triggers`},
    {key:'auth_policy',label:'Implemented authentication policy',passed:Number(unsupportedPolicy?.total||0)===0,detail:Number(unsupportedPolicy?.total||0)===0?'No unsupported flags enabled':'Unsupported flags require review'},
    {key:'admin_resilience',label:'Active management accounts',passed:Number(admins?.total||0)>=2,detail:`${Number(admins?.total||0)} active manager or owner accounts`},
    {key:'password_onboarding',label:'Temporary workforce passwords',passed:Number(passwords?.total||0)===0,detail:Number(passwords?.total||0)===0?'No outstanding forced changes':`${Number(passwords?.total||0)} password change${Number(passwords?.total||0)===1?'':'s'} outstanding`},
    {key:'maintenance',label:'Hourly maintenance',passed:maintenance?.status==='succeeded',detail:maintenance?.status==='succeeded'?`Last completed ${maintenance.last_completed_at}`:`Status: ${maintenance?.status||'not run'}`}
  ];
  return json({version:VERSION,generatedAt:new Date().toISOString(),overallStatus,summary:{approved,ready,inProgress:domains.filter(domain=>domain.status==='in_progress').length,total:domains.length,technicalPassed:technicalEvidence.filter(item=>item.passed).length,technicalTotal:technicalEvidence.length},domains,technicalEvidence,permissions:access});
}

async function updateLaunchGovernanceDomain(request,db,session,domainKey){
  const access=await launchGovernanceAccess(db,session);if(!access.canManage)return forbidden();
  const definition=launchGovernanceDomain(domainKey);if(!definition)return notFound('Launch-governance domain');
  const input=await readJson(request),ownerName=clean(input.ownerName).slice(0,160),ownerRole=clean(input.ownerRole).slice(0,160),evidenceSummary=clean(input.evidenceSummary).slice(0,10000),evidenceReference=clean(input.evidenceReference).slice(0,1000),inputChecks=input.checks&&typeof input.checks==='object'?input.checks:{};
  const checks=definition.checks.map(([key])=>{const state=inputChecks[key]||{},completed=Boolean(state.completed),evidenceNote=clean(state.evidenceNote).slice(0,2000);return {key,completed,evidenceNote};});
  const incompleteEvidence=checks.find(check=>check.completed&&check.evidenceNote.length<3);if(incompleteEvidence)return json({error:{code:'EVIDENCE_NOTE_REQUIRED',message:'Add an evidence note for every completed criterion.'}},400);
  const record={owner_name:ownerName,owner_role:ownerRole,evidence_summary:evidenceSummary,evidence_reference:evidenceReference};
  const status=deriveLaunchDomainStatus(record,checks);
  const statements=[db.prepare(`INSERT INTO organisation_launch_governance(organisation_id,domain_key,owner_name,owner_role,evidence_summary,evidence_reference,status,updated_by)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id,domain_key) DO UPDATE SET owner_name=excluded.owner_name,owner_role=excluded.owner_role,evidence_summary=excluded.evidence_summary,evidence_reference=excluded.evidence_reference,status=excluded.status,approved_by=NULL,approved_by_name=NULL,approved_by_role=NULL,approved_at=NULL,review_due_at=NULL,declaration_text=NULL,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,definition.key,ownerName,ownerRole,evidenceSummary,evidenceReference,status,session.user_id)];
  for(const check of checks)statements.push(db.prepare(`INSERT INTO organisation_launch_governance_checks(organisation_id,domain_key,check_key,completed,evidence_note,completed_by,completed_at)
    VALUES(?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(organisation_id,domain_key,check_key) DO UPDATE SET completed=excluded.completed,evidence_note=excluded.evidence_note,completed_by=CASE WHEN excluded.completed=1 THEN excluded.completed_by ELSE NULL END,completed_at=CASE WHEN excluded.completed=1 THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,definition.key,check.key,check.completed?1:0,check.evidenceNote,check.completed?session.user_id:null,check.completed?1:0));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'launch_governance.evidence_updated','launch_governance',definition.key,{status,completed:checks.filter(check=>check.completed).length,total:checks.length,evidenceReference}));
  await db.batch(statements);return json({ok:true,status});
}

async function updateLaunchGovernanceSignoff(request,db,session,domainKey){
  const access=await launchGovernanceAccess(db,session);if(!access.canApprove)return forbidden();
  const definition=launchGovernanceDomain(domainKey);if(!definition)return notFound('Launch-governance domain');
  const input=await readJson(request),action=clean(input.action)||'approve';
  const record=await db.prepare('SELECT * FROM organisation_launch_governance WHERE organisation_id=? AND domain_key=?').bind(session.organisation_id,definition.key).first();if(!record)return json({error:{code:'EVIDENCE_REQUIRED',message:'Save the evidence record before sign-off.'}},409);
  if(action==='reopen'){
    const reason=clean(input.reason).slice(0,1000);if(reason.length<8)return json({error:{code:'REASON_REQUIRED',message:'Enter a clear reason for reopening this approval.'}},400);
    const checksResult=await db.prepare('SELECT completed FROM organisation_launch_governance_checks WHERE organisation_id=? AND domain_key=?').bind(session.organisation_id,definition.key).all();
    const checks=(checksResult.results||[]).map(check=>({completed:Boolean(check.completed)})),status=deriveLaunchDomainStatus({...record,status:''},checks);
    await db.batch([db.prepare(`UPDATE organisation_launch_governance SET status=?,approved_by=NULL,approved_by_name=NULL,approved_by_role=NULL,approved_at=NULL,review_due_at=NULL,declaration_text=NULL,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND domain_key=?`).bind(status,session.user_id,session.organisation_id,definition.key),auditStatement(db,session.organisation_id,session.user_id,'launch_governance.reopened','launch_governance',definition.key,{reason})]);
    return json({ok:true,status});
  }
  if(action!=='approve')return badRequest('Choose approve or reopen.');
  if(input.declaration!==true)return json({error:{code:'DECLARATION_REQUIRED',message:'Confirm the accountable sign-off declaration.'}},400);
  const signatoryRole=clean(input.signatoryRole).slice(0,160);if(signatoryRole.length<3)return json({error:{code:'SIGNATORY_ROLE_REQUIRED',message:'Enter the accountable role under which you are signing.'}},400);
  const reviewDueAt=clean(input.reviewDueAt);if(reviewDueAt&&!/^\d{4}-\d{2}-\d{2}$/.test(reviewDueAt))return badRequest('Enter a valid review date.');
  const checksResult=await db.prepare('SELECT check_key,completed,evidence_note FROM organisation_launch_governance_checks WHERE organisation_id=? AND domain_key=?').bind(session.organisation_id,definition.key).all();
  const checks=definition.checks.map(([key])=>{const state=(checksResult.results||[]).find(item=>item.check_key===key)||{};return {key,completed:Boolean(state.completed),evidenceNote:state.evidence_note||''};});
  const recordsResult=await db.prepare('SELECT domain_key,status FROM organisation_launch_governance WHERE organisation_id=?').bind(session.organisation_id).all(),recordMap=new Map((recordsResult.results||[]).map(item=>[item.domain_key,item]));
  const prerequisites=LAUNCH_GOVERNANCE_DOMAINS.map(domain=>({key:domain.key,status:recordMap.get(domain.key)?.status||'not_started'}));
  const validation=validateLaunchSignoff(definition,{...record,status:''},checks,prerequisites);if(validation)return json({error:{code:'SIGNOFF_NOT_READY',message:validation}},409);
  const declarationText=`I confirm that the ${definition.title.toLowerCase()} evidence has been reviewed, is accurate for this organisation and is approved under my stated accountable role.`;
  await db.batch([db.prepare(`UPDATE organisation_launch_governance SET status='approved',approved_by=?,approved_by_name=?,approved_by_role=?,approved_at=CURRENT_TIMESTAMP,review_due_at=?,declaration_text=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND domain_key=?`).bind(session.user_id,session.display_name||session.email,signatoryRole,reviewDueAt||null,declarationText,session.user_id,session.organisation_id,definition.key),auditStatement(db,session.organisation_id,session.user_id,'launch_governance.approved','launch_governance',definition.key,{signatoryRole,reviewDueAt:reviewDueAt||null,declaration:declarationText})]);
  return json({ok:true,status:'approved'});
}

function canManageSecurity(session){return Boolean(session.is_platform_user)||session.access_level==='organisation_owner'||(!session.access_level&&session.role==='owner');}
async function permissionFacts(db,session){
  if(!session._permissionFacts){
    session._permissionFacts=Promise.all([
      db.prepare(`SELECT permission_key,effect FROM user_permission_overrides WHERE organisation_id=? AND user_id=?`).bind(session.organisation_id,session.user_id).all(),
      db.prepare(`SELECT crp.permission_key,crp.effect FROM user_custom_roles ucr JOIN custom_roles cr ON cr.id=ucr.role_id AND cr.is_active=1 JOIN custom_role_permissions crp ON crp.role_id=cr.id WHERE ucr.user_id=? AND ucr.organisation_id=? AND (ucr.valid_from IS NULL OR datetime(ucr.valid_from)<=CURRENT_TIMESTAMP) AND (ucr.valid_until IS NULL OR datetime(ucr.valid_until)>CURRENT_TIMESTAMP) AND (ucr.branch_id IS NULL OR ucr.branch_id=?)`).bind(session.user_id,session.organisation_id,session.active_branch_id||session.home_branch_id||'').all()
    ]).then(([direct,assigned])=>({direct:direct.results||[],assigned:assigned.results||[]}));
  }
  return session._permissionFacts;
}
async function userHasPermission(db,session,key){
  if(session.is_platform_user || ['platform_owner','organisation_owner'].includes(session.access_level)) return true;
  const {direct,assigned:rows}=await permissionFacts(db,session);
  if(direct.some(r=>r.permission_key===key&&r.effect==='deny')) return false;
  if(direct.some(r=>r.permission_key===key&&r.effect==='allow')) return true;
  if(rows.some(r=>r.permission_key===key&&r.effect==='deny')) return false;
  if(rows.some(r=>r.permission_key===key&&r.effect==='allow')) return true;
  const sources=impliedPermissionSources(key);
  if(sources.some(source=>direct.some(r=>r.permission_key===source&&r.effect==='deny')))return false;
  if(sources.some(source=>direct.some(r=>r.permission_key===source&&r.effect==='allow')))return true;
  if(sources.some(source=>rows.some(r=>r.permission_key===source&&r.effect==='deny')))return false;
  if(sources.some(source=>rows.some(r=>r.permission_key===source&&r.effect==='allow')))return true;
  const standard=standardPermissionsForRole(session.access_level||session.role);
  return standard.includes('*')||standard.includes(key)||sources.some(source=>standard.includes(source));
}
async function mayGrantPermission(db,session,key){return canManageSecurity(session)?!key.startsWith('platform.'):userHasPermission(db,session,key);}
function mayManageUser(session,target){return canManageSecurity(session)||canAssignStandardRole(session.access_level||session.role,target.access_level||target.role);}
async function listPermissionCatalogue(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.view'))return forbidden();const r=await db.prepare('SELECT * FROM permission_catalog ORDER BY category,name').all();return json({permissions:r.results||[]});}
async function listCustomRoles(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.view'))return forbidden();const r=await db.prepare(`SELECT cr.*,(SELECT COUNT(*) FROM custom_role_permissions p WHERE p.role_id=cr.id) permission_count,(SELECT COUNT(*) FROM user_custom_roles u WHERE u.role_id=cr.id) user_count FROM custom_roles cr WHERE cr.organisation_id=? AND cr.is_active=1 ORDER BY cr.name`).bind(session.organisation_id).all();for(const role of r.results||[]){const p=await db.prepare('SELECT permission_key,effect FROM custom_role_permissions WHERE role_id=? ORDER BY permission_key').bind(role.id).all();role.permissions=p.results||[];}return json({roles:r.results||[]});}
async function saveRole(request,db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.manage'))return forbidden();const i=await readJson(request),name=clean(i.name),description=clean(i.description),colour=clean(i.colour)||'#0f766e',permissions=Array.isArray(i.permissions)?[...new Set(i.permissions.map(clean).filter(Boolean))]:[];if(name.length<2)return json({error:{code:'VALIDATION_ERROR',message:'Enter a role name.'}},400);for(const key of permissions)if(!await mayGrantPermission(db,session,key))return forbidden(`You cannot grant the ${key} permission.`);if(!id)id=crypto.randomUUID();const existing=await db.prepare('SELECT id FROM custom_roles WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();const statements=[];if(existing)statements.push(db.prepare('UPDATE custom_roles SET name=?,description=?,colour=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(name,description,colour,id,session.organisation_id));else statements.push(db.prepare('INSERT INTO custom_roles(id,organisation_id,name,description,colour,created_by) VALUES(?,?,?,?,?,?)').bind(id,session.organisation_id,name,description,colour,session.user_id));statements.push(db.prepare('DELETE FROM custom_role_permissions WHERE role_id=? AND EXISTS (SELECT 1 FROM custom_roles r WHERE r.id=role_id AND r.organisation_id=?)').bind(id,session.organisation_id));for(const key of permissions)statements.push(db.prepare('INSERT OR IGNORE INTO custom_role_permissions(role_id,permission_key,effect) SELECT ?,permission_key,? FROM permission_catalog WHERE permission_key=?').bind(id,'allow',key));statements.push(auditStatement(db,session.organisation_id,session.user_id,existing?'security.role_updated':'security.role_created','custom_role',id,{name,permissions}));await db.batch(statements);return json({ok:true,id},existing?200:201);}
async function createCustomRole(request,db,session){return saveRole(request,db,session,null)}
async function updateCustomRole(request,db,session,id){return saveRole(request,db,session,id)}
async function deleteCustomRole(db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.manage'))return forbidden();const role=await db.prepare('SELECT id,name FROM custom_roles WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!role)return json({error:{code:'NOT_FOUND',message:'Role not found.'}},404);await db.batch([db.prepare('DELETE FROM user_custom_roles WHERE role_id=? AND organisation_id=?').bind(id,session.organisation_id),db.prepare('UPDATE custom_roles SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'security.role_deleted','custom_role',id,{name:role.name})]);return json({ok:true});}
async function securityOverview(db,session){if(!await userHasPermission(db,session,'security.users.view'))return forbidden();const r=await db.prepare(`SELECT (SELECT COUNT(*) FROM custom_roles WHERE organisation_id=? AND is_active=1) customRoles,(SELECT COUNT(*) FROM users WHERE organisation_id=? AND status='active') activeUsers,(SELECT COUNT(*) FROM sessions WHERE organisation_id=? AND datetime(expires_at)>CURRENT_TIMESTAMP) activeSessions,(SELECT COUNT(*) FROM audit_log WHERE organisation_id=? AND created_at>=datetime('now','-1 day') AND action LIKE 'security.%') securityEvents24h`).bind(session.organisation_id,session.organisation_id,session.organisation_id,session.organisation_id).first();return json(r||{});}
async function listActiveSessions(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.sessions.manage'))return forbidden();const r=await db.prepare(`SELECT s.id,s.user_id,s.created_at,s.last_seen_at,s.expires_at,s.user_agent,s.ip_hint,u.display_name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.organisation_id=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP ORDER BY s.last_seen_at DESC`).bind(session.organisation_id).all();return json({sessions:r.results||[],currentSessionId:session.session_id});}
async function revokeSession(db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.sessions.manage'))return forbidden();if(id===session.session_id)return json({error:{code:'CURRENT_SESSION',message:'Use sign out to end your current session.'}},400);const target=await db.prepare('SELECT id,user_id FROM sessions WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!target)return json({error:{code:'NOT_FOUND',message:'Session not found.'}},404);await db.batch([db.prepare('DELETE FROM sessions WHERE id=? AND organisation_id=?').bind(id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'security.session_revoked','session',id,{targetUserId:target.user_id})]);return json({ok:true});}
async function getSecurityPolicy(db,session){if(!await userHasPermission(db,session,'organisation.settings.view'))return forbidden();await db.prepare('INSERT OR IGNORE INTO organisation_security_policies(organisation_id) VALUES(?)').bind(session.organisation_id).run();const p=await db.prepare('SELECT * FROM organisation_security_policies WHERE organisation_id=?').bind(session.organisation_id).first();return json({policy:p});}
async function updateSecurityPolicy(request,db,session){if(!await userHasPermission(db,session,'organisation.settings.manage'))return forbidden();const i=await readJson(request),hours=Math.max(1,Math.min(168,Number(i.sessionHours)||12)),idle=Math.max(5,Math.min(1440,Number(i.idleTimeoutMinutes)||60));if(i.requireMfa||i.requireTrustedDevice||i.allowPasswordLogin===false)return json({error:{code:'SECURITY_METHOD_NOT_CONFIGURED',message:'MFA, trusted-device enforcement and passwordless sign-in cannot be enabled until an alternative sign-in provider is configured.'}},409);await db.batch([db.prepare(`INSERT INTO organisation_security_policies(organisation_id,require_mfa,session_hours,idle_timeout_minutes,allow_password_login,require_trusted_device,updated_at) VALUES(?,0,?,?,1,0,CURRENT_TIMESTAMP) ON CONFLICT(organisation_id) DO UPDATE SET require_mfa=0,session_hours=excluded.session_hours,idle_timeout_minutes=excluded.idle_timeout_minutes,allow_password_login=1,require_trusted_device=0,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,hours,idle),auditStatement(db,session.organisation_id,session.user_id,'security.policy_updated','organisation_security_policy',session.organisation_id,{hours,idle,requireMfa:false,requireTrustedDevice:false,allowPasswordLogin:true})]);return getSecurityPolicy(db,session);}
async function listLoginHistory(db,session){if(!await userHasPermission(db,session,'security.audit.view'))return forbidden();const r=await db.prepare(`SELECT lh.*,u.display_name,u.email FROM login_history lh LEFT JOIN users u ON u.id=lh.user_id WHERE lh.organisation_id=? ORDER BY lh.created_at DESC LIMIT 100`).bind(session.organisation_id).all();return json({events:r.results||[]});}
async function effectiveAccess(db,session,url){if(!await userHasPermission(db,session,'security.users.view'))return forbidden();const userId=clean(url.searchParams.get('userId'));const user=await db.prepare('SELECT id,display_name,email,role,access_level,home_branch_id FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();if(!user)return json({error:{code:'NOT_FOUND',message:'User not found.'}},404);const catalog=await db.prepare('SELECT permission_key,category,name,risk_level FROM permission_catalog ORDER BY category,name').all();const fake={...session,user_id:user.id,role:user.role,access_level:user.access_level,home_branch_id:user.home_branch_id,is_platform_user:0,_permissionFacts:null};const permissions=[];for(const p of catalog.results||[])if(await userHasPermission(db,fake,p.permission_key))permissions.push(p);return json({user,permissions});}
async function accessGovernance(db,session){
  if(!await userHasPermission(db,session,'security.users.view'))return forbidden();
  const scoped=branchRestricted(session);
  const rows=await db.prepare(`SELECT u.id,u.display_name,u.email,u.access_level,u.status,u.home_branch_id,u.last_login_at,
    r.outcome review_outcome,r.review_summary,r.reviewed_at,r.next_review_date,reviewer.display_name reviewer_name
    FROM users u
    LEFT JOIN user_access_reviews r ON r.id=(SELECT latest.id FROM user_access_reviews latest WHERE latest.organisation_id=u.organisation_id AND latest.user_id=u.id ORDER BY latest.reviewed_at DESC,latest.id DESC LIMIT 1)
    LEFT JOIN users reviewer ON reviewer.id=r.reviewer_id AND reviewer.organisation_id=r.organisation_id
    WHERE u.organisation_id=? AND u.access_level!='family' ${scoped?'AND u.home_branch_id=?':''}
    ORDER BY u.display_name COLLATE NOCASE`).bind(session.organisation_id,...(scoped?[activeBranch(session)]:[])).all();
  const users=(rows.results||[]).map(row=>({id:row.id,displayName:row.display_name,email:row.email,accessLevel:row.access_level,status:row.status,branchId:row.home_branch_id||null,lastLoginAt:row.last_login_at||null,review:{outcome:row.review_outcome||null,summary:row.review_summary||'',reviewedAt:row.reviewed_at||null,nextReviewDate:row.next_review_date||null,reviewerName:row.reviewer_name||'',state:accessReviewState(row.next_review_date)}}));
  return json({profiles:publicStandardRoleProfiles(),users});
}
async function recordUserAccessReview(request,db,session){
  if(!await userHasPermission(db,session,'security.users.manage'))return forbidden();
  const input=await readJson(request),userId=clean(input.userId),outcome=clean(input.outcome),summary=clean(input.reviewSummary),nextReviewDate=clean(input.nextReviewDate);
  if(!userId||!['confirmed','changed','disabled'].includes(outcome)||summary.length<8||!/^\d{4}-\d{2}-\d{2}$/.test(nextReviewDate))return json({error:{code:'VALIDATION_ERROR',message:'Choose an outcome, enter a clear review summary and set the next review date.'}},400);
  const due=new Date(`${nextReviewDate}T23:59:59Z`);if(!Number.isFinite(due.getTime())||due.getTime()<Date.now())return json({error:{code:'VALIDATION_ERROR',message:'The next access review must be in the future.'}},400);
  if(userId===session.user_id)return json({error:{code:'SELF_REVIEW_BLOCKED',message:'A different authorised manager must review your access.'}},400);
  const user=await db.prepare('SELECT id,role,access_level,home_branch_id,status FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();if(!user)return notFound('User');
  if((branchRestricted(session)&&user.home_branch_id!==activeBranch(session))||!mayManageUser(session,user))return forbidden();
  if(user.access_level==='organisation_owner'&&outcome==='disabled')return forbidden('Organisation owner access must be transferred through the user account controls.');
  const id=crypto.randomUUID(),statements=[db.prepare('INSERT INTO user_access_reviews(id,organisation_id,user_id,reviewer_id,outcome,review_summary,next_review_date) VALUES(?,?,?,?,?,?,?)').bind(id,session.organisation_id,userId,session.user_id,outcome,summary,nextReviewDate),auditStatement(db,session.organisation_id,session.user_id,'security.access_reviewed','user',userId,{outcome,nextReviewDate,summary})];
  if(outcome==='disabled'){statements.push(db.prepare("UPDATE users SET status='disabled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(userId,session.organisation_id),db.prepare('DELETE FROM sessions WHERE user_id=? AND organisation_id=?').bind(userId,session.organisation_id));}
  await db.batch(statements);return json({ok:true,id},201);
}
async function updateEmergencyMode(request,db,session){if(!await userHasPermission(db,session,'organisation.settings.manage'))return forbidden();const i=await readJson(request),enabled=!!i.enabled,reason=clean(i.reason);if(enabled&&reason.length<8)return json({error:{code:'REASON_REQUIRED',message:'Enter a clear reason for enabling emergency mode.'}},400);await db.batch([db.prepare(`INSERT INTO organisation_security_policies(organisation_id,emergency_mode,emergency_reason,emergency_started_at,emergency_started_by) VALUES(?,?,?,?,?) ON CONFLICT(organisation_id) DO UPDATE SET emergency_mode=excluded.emergency_mode,emergency_reason=excluded.emergency_reason,emergency_started_at=excluded.emergency_started_at,emergency_started_by=excluded.emergency_started_by,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,enabled?1:0,enabled?reason:null,enabled?new Date().toISOString():null,enabled?session.user_id:null),auditStatement(db,session.organisation_id,session.user_id,enabled?'security.emergency_mode_enabled':'security.emergency_mode_disabled','organisation',session.organisation_id,{reason})]);return getSecurityPolicy(db,session);}

async function platformAssistantHistory(db, session) {
  if (!requirePlatform(session)) return forbidden();
  const conversation = await db.prepare("SELECT id FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(session.user_id).first();
  if (!conversation) return json({ conversationId: null, messages: [] });
  const rows = await db.prepare("SELECT role,content,created_at FROM ai_messages WHERE conversation_id=? ORDER BY created_at,id LIMIT 60").bind(conversation.id).all();
  return json({ conversationId: conversation.id, messages: rows.results || [] });
}

async function platformAssistant(request, db, session) {
  if (!requirePlatform(session)) return forbidden();
  const input = await readJson(request);
  const question = clean(input.question).slice(0, 500);
  if (question.length < 2) return json({ error: { code: 'VALIDATION_ERROR', message: 'Enter a question.' } }, 400);

  let conversationId = clean(input.conversationId);
  if (conversationId) {
    const own = await db.prepare("SELECT id FROM ai_conversations WHERE id=? AND user_id=?").bind(conversationId, session.user_id).first();
    if (!own) conversationId = '';
  }
  if (!conversationId) {
    conversationId = crypto.randomUUID();
    await db.prepare("INSERT INTO ai_conversations(id,user_id,title) VALUES(?,?,?)").bind(conversationId, session.user_id, question.slice(0, 80)).run();
  }

  const [orgs, users, clients, carePlans, risks, errors, sessions, support, revenueEvents] = await Promise.all([
    db.prepare(`SELECT o.id,o.name,o.status,o.subscription_status,o.renewal_date,
      COALESCE(sp.name,o.subscription_plan,'Unassigned') plan_name,
      COALESCE(sp.monthly_price_pence,0) monthly_price_pence,
      MAX(a.created_at) last_activity_at,COUNT(DISTINCT u.id) user_count
      FROM organisations o LEFT JOIN subscription_plans sp ON sp.id=o.subscription_plan
      LEFT JOIN users u ON u.organisation_id=o.id LEFT JOIN audit_log a ON a.organisation_id=o.id
      GROUP BY o.id ORDER BY o.name`).all(),
    db.prepare("SELECT COUNT(*) total,COUNT(CASE WHEN last_login_at>=datetime('now','-30 days') THEN 1 END) active30 FROM users").first(),
    db.prepare("SELECT COUNT(*) total FROM clients WHERE status<>'Archived'").first(),
    db.prepare("SELECT organisation_id,COUNT(*) total,COUNT(CASE WHEN review_date<date('now') AND status='Active' THEN 1 END) overdue FROM care_plans GROUP BY organisation_id").all(),
    db.prepare("SELECT organisation_id,COUNT(*) total,COUNT(CASE WHEN severity='High' AND status='Active' THEN 1 END) high FROM risk_assessments GROUP BY organisation_id").all(),
    db.prepare("SELECT COUNT(*) total FROM api_error_log WHERE created_at>=datetime('now','-1 day')").first(),
    db.prepare("SELECT COUNT(*) total FROM sessions WHERE expires_at>CURRENT_TIMESTAMP").first(),
    db.prepare("SELECT COUNT(*) total FROM support_sessions WHERE ended_at IS NULL").first(),
    db.prepare("SELECT COALESCE(SUM(amount_pence),0) total FROM revenue_events WHERE occurred_at>=date('now','start of month')").first()
  ]);

  const planMap = Object.fromEntries((carePlans.results || []).map(x => [x.organisation_id, x]));
  const riskMap = Object.fromEntries((risks.results || []).map(x => [x.organisation_id, x]));
  const organisations = (orgs.results || []).map(o => {
    let score = 100;
    const daysInactive = o.last_activity_at ? Math.floor((Date.now() - new Date(o.last_activity_at + 'Z')) / 86400000) : 999;
    const overdue = Number(planMap[o.id]?.overdue || 0);
    const high = Number(riskMap[o.id]?.high || 0);
    if (o.status !== 'active') score -= 45;
    if (daysInactive > 30) score -= 25; else if (daysInactive > 14) score -= 12;
    if (overdue) score -= Math.min(25, overdue * 5);
    if (high) score -= 10;
    if (!o.user_count) score -= 15;
    return { ...o, daysInactive, overdue, high, health: Math.max(0, score) };
  });

  const billable = organisations.filter(o => o.status === 'active' && o.subscription_status !== 'cancelled');
  const mrr = billable.reduce((n, o) => n + Number(o.monthly_price_pence || 0), 0);
  const atRisk = organisations.filter(o => o.health < 70).sort((a, b) => a.health - b.health);
  const renewals = organisations.filter(o => o.renewal_date).map(o => ({ ...o, days: Math.ceil((new Date(o.renewal_date + 'T00:00:00Z') - new Date()) / 86400000) })).filter(o => o.days >= 0 && o.days <= 90).sort((a, b) => a.days - b.days);
  const q = question.toLowerCase();
  const money = p => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(p / 100);
  let answer = '';

  if (/revenue|mrr|arr|income|commercial/.test(q)) {
    answer = `Current MRR is ${money(mrr)} and annual run rate is ${money(mrr * 12)} across ${billable.length} billable organisation${billable.length === 1 ? '' : 's'}. Revenue events recorded this month total ${money(Number(revenueEvents?.total || 0))}. Average revenue per billable organisation is ${money(billable.length ? Math.round(mrr / billable.length) : 0)}.`;
  } else if (/risk|attention|health|inactive|customer/.test(q)) {
    answer = atRisk.length ? `${atRisk.length} organisation${atRisk.length === 1 ? ' needs' : 's need'} attention:\n${atRisk.slice(0, 8).map(o => `• ${o.name}: health ${o.health}%, ${o.status !== 'active' ? 'account not active' : o.daysInactive > 14 ? `inactive for ${o.daysInactive} days` : o.overdue ? `${o.overdue} overdue care-plan review${o.overdue === 1 ? '' : 's'}` : o.high ? `${o.high} high risk${o.high === 1 ? '' : 's'}` : 'low adoption'}`).join('\n')}` : 'No organisations currently score below the attention threshold. The customer portfolio is healthy.';
  } else if (/renewal|renew/.test(q)) {
    answer = renewals.length ? `${renewals.length} renewal${renewals.length === 1 ? ' is' : 's are'} due in the next 90 days:\n${renewals.slice(0, 10).map(o => `• ${o.name}: ${o.days} days, ${o.plan_name}, ${money(o.monthly_price_pence)}/month`).join('\n')}` : 'There are no organisation renewals due in the next 90 days.';
  } else if (/error|operation|system|platform|healthy|session/.test(q)) {
    answer = `Platform status is ${Number(errors?.total || 0) === 0 ? 'healthy' : 'being monitored'}. There ${Number(errors?.total || 0) === 1 ? 'has' : 'have'} been ${Number(errors?.total || 0)} API error${Number(errors?.total || 0) === 1 ? '' : 's'} in the last 24 hours, ${Number(sessions?.total || 0)} active session${Number(sessions?.total || 0) === 1 ? '' : 's'}, and ${Number(support?.total || 0)} active Support Mode session${Number(support?.total || 0) === 1 ? '' : 's'}.`;
  } else if (/care plan|review|compliance/.test(q)) {
    const overdue = organisations.reduce((n, o) => n + o.overdue, 0);
    answer = `There ${overdue === 1 ? 'is' : 'are'} ${overdue} overdue active care-plan review${overdue === 1 ? '' : 's'} across the platform. ${overdue ? organisations.filter(o => o.overdue).map(o => `${o.name}: ${o.overdue}`).join('; ') : 'No immediate care-plan review action is required.'}`;
  } else {
    answer = `Executive briefing:\n• ${organisations.length} organisations, of which ${billable.length} are active and billable.\n• MRR ${money(mrr)}; ARR ${money(mrr * 12)}.\n• ${atRisk.length} organisations need attention.\n• ${renewals.length} renewals are due within 90 days.\n• ${Number(users?.active30 || 0)} of ${Number(users?.total || 0)} users were active in the last 30 days.\n• ${Number(clients?.total || 0)} active clients are recorded.\n• ${Number(errors?.total || 0)} API errors were recorded in the last 24 hours.`;
  }

  await db.batch([
    db.prepare("INSERT INTO ai_messages(id,conversation_id,role,content) VALUES(?,?,?,?)").bind(crypto.randomUUID(), conversationId, 'user', question),
    db.prepare("INSERT INTO ai_messages(id,conversation_id,role,content) VALUES(?,?,?,?)").bind(crypto.randomUUID(), conversationId, 'assistant', answer),
    db.prepare("UPDATE ai_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(conversationId),
    auditStatement(db, session.organisation_id, session.user_id, 'platform.ai_question', 'ai_conversation', conversationId, { question: question.slice(0, 120) })
  ]);
  return json({ conversationId, answer, generatedAt: new Date().toISOString() });
}


async function listNotifications(db,session,url){
  if(!requirePlatform(session))return forbidden();
  const category=clean(url.searchParams.get('category')),status=clean(url.searchParams.get('status')),search=clean(url.searchParams.get('search'));
  const clauses=[],args=[];
  if(category&&category!=='all'){clauses.push('n.category=?');args.push(category)}
  if(status==='unread')clauses.push('n.read_at IS NULL AND n.archived_at IS NULL');
  if(status==='read')clauses.push('n.read_at IS NOT NULL AND n.archived_at IS NULL');
  if(status==='acknowledged')clauses.push('n.acknowledged_at IS NOT NULL');
  if(status==='archived')clauses.push('n.archived_at IS NOT NULL');
  if(search){clauses.push('(LOWER(n.title) LIKE ? OR LOWER(n.message) LIKE ?)');args.push(`%${search.toLowerCase()}%`,`%${search.toLowerCase()}%`)}
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  const q=`SELECT n.*,o.name AS organisation_name FROM notifications n LEFT JOIN organisations o ON o.id=n.organisation_id ${where} ORDER BY CASE n.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warning' THEN 3 ELSE 4 END,n.created_at DESC LIMIT 200`;
  const rows=await db.prepare(q).bind(...args).all();
  const stats=await db.prepare(`SELECT SUM(CASE WHEN read_at IS NULL AND archived_at IS NULL THEN 1 ELSE 0 END) unread,SUM(CASE WHEN priority='critical' AND archived_at IS NULL THEN 1 ELSE 0 END) critical,SUM(CASE WHEN date(created_at)=date('now') THEN 1 ELSE 0 END) today,SUM(CASE WHEN acknowledged_at IS NOT NULL THEN 1 ELSE 0 END) acknowledged FROM notifications`).first();
  return json({notifications:rows.results||[],stats:stats||{}});
}
async function updateNotificationState(db,session,id,action){
  if(!requirePlatform(session))return forbidden();const row=await db.prepare('SELECT id,title FROM notifications WHERE id=?').bind(id).first();if(!row)return notFound('Notification');
  const column=action==='read'?'read_at':action==='acknowledge'?'acknowledged_at':'archived_at';
  await db.batch([db.prepare(`UPDATE notifications SET ${column}=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id),auditStatement(db,session.organisation_id,session.user_id,`platform.notification_${action}`,'notification',id,{title:row.title})]);
  return json({ok:true});
}
async function markAllNotificationsRead(db,session){if(!requirePlatform(session))return forbidden();await db.batch([db.prepare('UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE archived_at IS NULL'),auditStatement(db,session.organisation_id,session.user_id,'platform.notifications_mark_all_read','notification','all',{})]);return json({ok:true});}


const MODULE_PERMISSION_MAP = {
  dashboard:'dashboard.view', operations:'operations.view', clients:'clients.view', staff:'staff.view',
  family:'family_portal.manage', care:'care_plans.view', medication:'medication.view', visits:'visits.view',
  rota:'rota.view', tasks:'tasks.view', incidents:'incidents.view', finance:'finance.view', reports:'reports.view',
  settings:'organisation.settings.view'
};
async function buildAccessProfile(db,session){
  const catalog=await db.prepare('SELECT permission_key FROM permission_catalog ORDER BY permission_key').all();
  const permissions=[];
  for(const row of catalog.results||[]) if(await userHasPermission(db,session,row.permission_key)) permissions.push(row.permission_key);
  const moduleRows=await db.prepare('SELECT module_key,enabled FROM organisation_modules WHERE organisation_id=?').bind(session.organisation_id).all();
  const configured=Object.fromEntries((moduleRows.results||[]).map(x=>[x.module_key,Boolean(x.enabled)]));
  const modules={};
  for(const [module,key] of Object.entries(MODULE_PERMISSION_MAP)) modules[module]=(configured[module]!==false)&&permissions.includes(key);
  if(session.is_platform_user) for(const module of Object.keys(MODULE_PERMISSION_MAP)) modules[module]=configured[module]!==false;
  return {permissions,modules};
}
async function listOrganisationModules(db,session){
  if(!canManageSecurity(session)&&!await userHasPermission(db,session,'organisation.settings.view'))return forbidden();
  const rows=await db.prepare('SELECT module_key,enabled,updated_at FROM organisation_modules WHERE organisation_id=? ORDER BY module_key').bind(session.organisation_id).all();
  return json({modules:rows.results||[]});
}
async function updateOrganisationModules(request,db,session){
  if(!canManageSecurity(session)&&!await userHasPermission(db,session,'organisation.settings.manage'))return forbidden();
  const input=await readJson(request), modules=input.modules&&typeof input.modules==='object'?input.modules:{};
  const allowed=Object.keys(MODULE_PERMISSION_MAP), statements=[];
  for(const key of allowed){if(!(key in modules))continue;statements.push(db.prepare(`INSERT INTO organisation_modules(organisation_id,module_key,enabled,updated_by,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(organisation_id,module_key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,key,modules[key]?1:0,session.user_id));}
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'security.modules_updated','organisation',session.organisation_id,{modules}));
  await db.batch(statements);return json({ok:true});
}
async function getUserPermissionOverrides(db,session,userId){
  if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.users.manage'))return forbidden();
  const user=await db.prepare('SELECT id,display_name,email,role,access_level,home_branch_id FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();
  if(!user)return notFound('User');
  if(branchRestricted(session)&&user.home_branch_id!==activeBranch(session))return forbidden();
  if(user.id!==session.user_id&&!mayManageUser(session,user))return forbidden();
  const rows=await db.prepare('SELECT permission_key,effect FROM user_permission_overrides WHERE organisation_id=? AND user_id=? ORDER BY permission_key').bind(session.organisation_id,userId).all();
  return json({user,overrides:rows.results||[]});
}
async function updateUserPermissionOverrides(request,db,session,userId){
  if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.users.manage'))return forbidden();
  if(userId===session.user_id)return json({error:{code:'SELF_EDIT_BLOCKED',message:'You cannot change your own effective permissions.'}},400);
  const user=await db.prepare('SELECT id,role,access_level,home_branch_id FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();if(!user)return notFound('User');
  if((branchRestricted(session)&&user.home_branch_id!==activeBranch(session))||!mayManageUser(session,user))return forbidden();
  const input=await readJson(request),allow=Array.isArray(input.allow)?[...new Set(input.allow.map(clean).filter(Boolean))]:[],deny=Array.isArray(input.deny)?[...new Set(input.deny.map(clean).filter(Boolean))]:[];
  for(const key of [...allow,...deny])if(!await mayGrantPermission(db,session,key))return forbidden(`You cannot change the ${key} permission.`);
  const statements=[db.prepare('DELETE FROM user_permission_overrides WHERE organisation_id=? AND user_id=?').bind(session.organisation_id,userId)];
  for(const key of allow.filter(x=>!deny.includes(x)))statements.push(db.prepare(`INSERT INTO user_permission_overrides(organisation_id,user_id,permission_key,effect,assigned_by) SELECT ?,?,permission_key,'allow',? FROM permission_catalog WHERE permission_key=?`).bind(session.organisation_id,userId,session.user_id,key));
  for(const key of deny)statements.push(db.prepare(`INSERT INTO user_permission_overrides(organisation_id,user_id,permission_key,effect,assigned_by) SELECT ?,?,permission_key,'deny',? FROM permission_catalog WHERE permission_key=?`).bind(session.organisation_id,userId,session.user_id,key));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'security.user_permissions_updated','user',userId,{allow,deny}));await db.batch(statements);return json({ok:true});
}


async function supportProductId(db){const row=await db.prepare("SELECT id FROM platform_products WHERE code='CARE' LIMIT 1").first();return row?.id||'product-care';}
async function listOrganisationTickets(db,session,url){
 const status=url.searchParams.get('status')||'all',search=(url.searchParams.get('search')||'').trim();
 let sql=`SELECT t.*,p.name product_name,u.display_name assigned_name,(SELECT COUNT(*) FROM platform_ticket_messages m WHERE m.ticket_id=t.id AND m.message_type!='internal_note') message_count FROM platform_support_tickets t LEFT JOIN platform_products p ON p.id=t.product_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.organisation_id=?`;
 const binds=[session.organisation_id]; if(status!='all'){sql+=' AND t.status=?';binds.push(status)} if(search){sql+=' AND (t.ticket_number LIKE ? OR t.subject LIKE ?)';binds.push('%'+search+'%','%'+search+'%')} sql+=' ORDER BY t.updated_at DESC';
 const r=await db.prepare(sql).bind(...binds).all();return json({tickets:r.results||[]});
}
async function createOrganisationTicket(request,env,session){
 const db=env.DB;
 const b=await readJson(request,32_768),subject=String(b.subject||'').trim(),description=String(b.description||'').trim(); if(!subject||!description)return badRequest('Subject and description are required.');
 const id=crypto.randomUUID(),number='CC-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+id.slice(0,5).toUpperCase(),product=await supportProductId(db);
 await db.prepare(`INSERT INTO platform_support_tickets(id,ticket_number,product_id,organisation_id,subject,description,priority,category,status,created_by,created_at,updated_at,module,page_url,app_version,browser_info,device_info,branch_id,last_customer_reply_at,support_requester_name,support_requester_email) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?)`).bind(id,number,product,session.organisation_id,subject,description,['low','normal','high','critical'].includes(b.priority)?b.priority:'normal',String(b.category||'general'), 'new',session.user_id,String(b.module||''),String(b.pageUrl||''),VERSION,String(b.browserInfo||''),String(b.deviceInfo||''),session.active_branch_id||session.home_branch_id||null,String(session.display_name||''),String(session.email||'').trim().toLowerCase()).run();
 await db.prepare(`INSERT INTO platform_ticket_status_history(id,ticket_id,to_status,changed_by,note) VALUES(?,?,?,?,?)`).bind(crypto.randomUUID(),id,'new',session.user_id,'Ticket submitted by organisation').run();
 await writeAudit(db,session,'support.ticket.created','support_ticket',id,{ticket_number:number,subject});
 const delivery=await requestPlatformSupportTicket(env,{id,organisationId:session.organisation_id,subject,description,priority:['low','normal','high','critical'].includes(b.priority)?b.priority:'normal',category:String(b.category||'general'),version:VERSION,contactName:session.display_name,contactEmail:session.email,module:String(b.module||''),pageUrl:String(b.pageUrl||''),submittedAt:new Date().toISOString()});
 await db.prepare('UPDATE platform_support_tickets SET central_ticket_id=?,delivery_status=?,delivery_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(delivery.ticketId||null,delivery.status||'failed',delivery.error||null,id).run();
 return json({ok:true,id,ticketNumber:delivery.ticketNumber||number,localTicketNumber:number,delivery:{status:delivery.status,error:delivery.error||null}},201);
}
async function retryPendingCareSupportTickets(env){
 const rows=await env.DB.prepare(`SELECT t.id,t.organisation_id,t.subject,t.description,t.priority,t.category,t.module,t.page_url,t.created_at,
   COALESCE(NULLIF(t.support_requester_name,''),u.display_name,'') requester_name,
   COALESCE(NULLIF(t.support_requester_email,''),u.email,'') requester_email
   FROM platform_support_tickets t LEFT JOIN users u ON u.id=t.created_by AND u.organisation_id=t.organisation_id
   WHERE t.delivery_status!='delivered' ORDER BY t.updated_at LIMIT 10`).all();
 let delivered=0;
 for(const ticket of rows.results||[]){
  const result=await requestPlatformSupportTicket(env,{id:ticket.id,organisationId:ticket.organisation_id,subject:ticket.subject,description:ticket.description,priority:ticket.priority,category:ticket.category,version:VERSION,contactName:ticket.requester_name,contactEmail:ticket.requester_email,module:ticket.module,pageUrl:ticket.page_url,submittedAt:ticket.created_at});
  await env.DB.prepare('UPDATE platform_support_tickets SET central_ticket_id=COALESCE(?,central_ticket_id),delivery_status=?,delivery_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(result.ticketId||null,result.status||'failed',result.error||null,ticket.id).run();
  if(result.status==='delivered')delivered+=1;
 }
 return {attempted:rows.results?.length||0,delivered};
}
async function organisationTicketOrNull(db,session,id){return db.prepare(`SELECT t.*,p.name product_name,u.display_name assigned_name,c.display_name created_name FROM platform_support_tickets t LEFT JOIN platform_products p ON p.id=t.product_id LEFT JOIN users u ON u.id=t.assigned_to LEFT JOIN users c ON c.id=t.created_by WHERE t.id=? AND t.organisation_id=?`).bind(id,session.organisation_id).first()}
async function getOrganisationTicket(db,session,id){const ticket=await organisationTicketOrNull(db,session,id);if(!ticket)return notFound('Ticket');const [m,a,h]=await Promise.all([db.prepare(`SELECT m.*,u.display_name author_name FROM platform_ticket_messages m LEFT JOIN users u ON u.id=m.author_user_id WHERE m.ticket_id=? AND m.message_type!='internal_note' ORDER BY m.created_at`).bind(id).all(),db.prepare(`SELECT id,file_name,mime_type,size_bytes,created_at AS uploaded_at FROM platform_ticket_attachments WHERE ticket_id=? ORDER BY created_at`).bind(id).all(),db.prepare(`SELECT h.*,u.display_name changed_name FROM platform_ticket_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.ticket_id=? ORDER BY h.changed_at`).bind(id).all()]);return json({ticket,messages:m.results||[],attachments:a.results||[],history:h.results||[]})}
async function updateOrganisationTicket(request,db,session,id){const current=await organisationTicketOrNull(db,session,id);if(!current)return notFound('Ticket');const b=await readJson(request,16_384),action=b.action;if(action==='close'&&!['resolved','closed'].includes(current.status)){await db.prepare(`UPDATE platform_support_tickets SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();await db.prepare(`INSERT INTO platform_ticket_status_history(id,ticket_id,from_status,to_status,changed_by,note) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),id,current.status,'closed',session.user_id,'Closed by organisation').run()}else if(action==='reopen'&&['resolved','closed'].includes(current.status)){await db.prepare(`UPDATE platform_support_tickets SET status='open',updated_at=CURRENT_TIMESTAMP,last_customer_reply_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();await db.prepare(`INSERT INTO platform_ticket_status_history(id,ticket_id,from_status,to_status,changed_by,note) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),id,current.status,'open',session.user_id,'Reopened by organisation').run()}else return badRequest('Invalid ticket action.');return json({ok:true})}
async function addOrganisationTicketMessage(request,db,session,id){const t=await organisationTicketOrNull(db,session,id);if(!t)return notFound('Ticket');const b=await readJson(request,32_768),body=String(b.body||'').trim();if(!body)return badRequest('Reply is required.');const mid=crypto.randomUUID();await db.prepare(`INSERT INTO platform_ticket_messages(id,ticket_id,author_user_id,message_type,body) VALUES(?,?,?,?,?)`).bind(mid,id,session.user_id,'customer_reply',body).run();const next=['resolved','closed'].includes(t.status)?'open':(t.status==='waiting_customer'?'open':t.status);await db.prepare(`UPDATE platform_support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP,last_customer_reply_at=CURRENT_TIMESTAMP WHERE id=?`).bind(next,id).run();if(next!==t.status)await db.prepare(`INSERT INTO platform_ticket_status_history(id,ticket_id,from_status,to_status,changed_by,note) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),id,t.status,next,session.user_id,'Customer replied').run();return json({ok:true,id:mid},201)}
async function addOrganisationTicketAttachment(request,db,session,id){const t=await organisationTicketOrNull(db,session,id);if(!t)return notFound('Ticket');const b=await readJson(request,2_900_000),data=String(b.dataBase64||''),name=String(b.fileName||'attachment');if(!data||data.length>2800000)return badRequest('Attachment must be smaller than 2 MB.');const aid=crypto.randomUUID();await db.prepare(`INSERT INTO platform_ticket_attachments(id,ticket_id,file_name,mime_type,size_bytes,data_url,uploaded_by) VALUES(?,?,?,?,?,?,?)`).bind(aid,id,name,String(b.mimeType||'application/octet-stream'),Number(b.sizeBytes||0),data,session.user_id).run();await db.prepare(`UPDATE platform_support_tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();return json({ok:true,id:aid},201)}
async function getOrganisationTicketAttachment(db,session,id){const a=await db.prepare(`SELECT a.* FROM platform_ticket_attachments a JOIN platform_support_tickets t ON t.id=a.ticket_id WHERE a.id=? AND t.organisation_id=?`).bind(id,session.organisation_id).first();if(!a)return notFound('Attachment');const bytes=Uint8Array.from(atob(a.data_url),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'content-type':a.mime_type,'content-disposition':`attachment; filename="${String(a.file_name).replaceAll('"','')}"`,'cache-control':'private, no-store'}})}
