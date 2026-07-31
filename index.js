/** CoreCare Enterprise 1.25.2 — Care Plan Domain Stability */
const VERSION = "1.25.2";
const SESSION_COOKIE = "corecare_session";
const SESSION_HOURS = 12;
const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 5;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return health(env);
      if (url.pathname === "/api/version") return json({ name: "CoreCare", version: VERSION, release: "CoreCare Enterprise 1.25.2 — Care Plan Domain Stability" });
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/session" && request.method === "GET") return sessionInfo(request, env);

      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return databaseRequired();
        const session = await requireSession(request, env.DB);
        if (session instanceof Response) return session;

        if (url.pathname === "/api/auth/change-password" && request.method === "POST") return changePassword(request, env.DB, session);
        if (url.pathname === "/api/development/status") return developmentStatus(env, session);
        if (url.pathname === "/api/dashboard" && request.method === "GET") return dashboardSummary(env.DB, session);
        if (url.pathname === "/api/carer/dashboard" && request.method === "GET") return await permitted(env.DB, session, "visits.view", () => carerDashboard(env.DB, session));
        if (url.pathname === "/api/operations/board" && request.method === "GET") return requireManagementWorkspace(session) || operationsBoard(env.DB, session);
        if (url.pathname === "/api/rota" && request.method === "GET") return requireManagementWorkspace(session) || rotaBoard(env.DB, session, url);
        if (url.pathname === "/api/rota" && request.method === "POST") return requireManagementWorkspace(session) || createRotaVisit(request, env, session);
        if (url.pathname === "/api/rota/templates" && request.method === "GET") return listRotaTemplates(env.DB, session);
        if (url.pathname === "/api/rota/templates/visit" && request.method === "POST") return saveRotaVisitTemplate(request, env.DB, session);
        if (url.pathname === "/api/rota/templates/working-pattern" && request.method === "POST") return saveWorkingPattern(request, env.DB, session);
        if (url.pathname === "/api/rota/templates/exception" && request.method === "POST") return saveRotaException(request, env.DB, session);
        if (url.pathname === "/api/rota/templates/generate" && request.method === "POST") return generateRotaFromTemplates(request, env, session);
        const templateDeleteMatch=url.pathname.match(/^\/api\/rota\/templates\/(visit|working-pattern|exception)\/([^/]+)$/);
        if(templateDeleteMatch&&request.method === "DELETE") return deleteRotaTemplateItem(env.DB,session,templateDeleteMatch[1],decodeURIComponent(templateDeleteMatch[2]));
        if (url.pathname === "/api/routing/settings") {
          if (request.method === "GET") return getRoutingSettings(env, session);
          if (request.method === "PUT") return updateRoutingSettings(request, env, session);
        }
        if (url.pathname === "/api/routing/recalculate" && request.method === "POST") return recalculateRouting(request, env, session);
        const requirementMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/visit-requirements$/);
        if (requirementMatch && request.method === "GET") return listVisitRequirements(env.DB, session, decodeURIComponent(requirementMatch[1]));
        if (requirementMatch && request.method === "POST") return saveVisitRequirements(request, env.DB, session, decodeURIComponent(requirementMatch[1]));
        if (/^\/api\/rota\/[^/]+\/recurrence$/.test(url.pathname) && request.method === "POST") return manageVisitRecurrence(request, env.DB, session, url.pathname.split("/")[3]);
        if (/^\/api\/rota\/[^/]+$/.test(url.pathname) && request.method === "PATCH") return updateRotaVisit(request, env, session, url.pathname.split("/").pop());
        if (/^\/api\/rota\/[^/]+\/cancel$/.test(url.pathname) && request.method === "POST") return cancelRotaVisit(request, env.DB, session, url.pathname.split("/")[3]);
        if (url.pathname === "/api/visits/board" && request.method === "GET") return requireManagementWorkspace(session) || visitsBoard(env.DB, session);
        if (url.pathname === "/api/visits" && request.method === "POST") return requireManagementWorkspace(session) || createVisit(request, env.DB, session);
        if (url.pathname === "/api/visits/client-code" && request.method === "POST") return requireManagementWorkspace(session) || ensureClientVisitCode(request, env.DB, session);
        if (url.pathname === "/api/visits/sync" && request.method === "POST") return syncVisitEvents(request, env.DB, session);
        const visitRecordMatch = url.pathname.match(/^\/api\/visits\/([^/]+)\/care-record$/);
        if (visitRecordMatch && request.method === "GET") return getVisitCareRecord(env.DB, session, decodeURIComponent(visitRecordMatch[1]));
        if (visitRecordMatch && request.method === "POST") return saveVisitCareRecord(request, env.DB, session, decodeURIComponent(visitRecordMatch[1]));
        if (url.pathname === "/api/operations/tasks" && request.method === "POST") return createOperationsTask(request, env.DB, session);
        const operationsTaskMatch = url.pathname.match(/^\/api\/operations\/tasks\/([^/]+)\/(complete|escalate)$/);
        if (operationsTaskMatch && request.method === "POST") return updateOperationsTask(env.DB, session, decodeURIComponent(operationsTaskMatch[1]), operationsTaskMatch[2]);
        if (url.pathname === "/api/operations/incidents" && request.method === "POST") return createOperationsIncident(request, env.DB, session);
        const operationsIncidentMatch = url.pathname.match(/^\/api\/operations\/incidents\/([^/]+)\/review$/);
        if (operationsIncidentMatch && request.method === "POST") return reviewOperationsIncident(request, env.DB, session, decodeURIComponent(operationsIncidentMatch[1]));
        if (url.pathname === "/api/operations/handovers" && request.method === "POST") return createShiftHandover(request, env.DB, session);
        const handoverAckMatch = url.pathname.match(/^\/api\/operations\/handovers\/([^/]+)\/acknowledge$/);
        if (handoverAckMatch && request.method === "POST") return acknowledgeShiftHandover(env.DB, session, decodeURIComponent(handoverAckMatch[1]));
        if (url.pathname === "/api/care-plans" && request.method === "GET") return await permitted(env.DB, session, "care_plans.view", () => listAllCarePlans(env.DB, session, url));
        if (url.pathname === "/api/care-delivery/dashboard" && request.method === "GET") return await permitted(env.DB, session, "care_plans.view", () => careDeliveryDashboard(env.DB, session));
        if (url.pathname === "/api/medication" && request.method === "GET") return await permitted(env.DB, session, "medication.view", () => listMedication(env.DB, session, url));
        if (url.pathname === "/api/medication" && request.method === "POST") return await permitted(env.DB, session, "medication.manage", () => saveMedication(request, env.DB, session));
        const medicationAdminMatch = url.pathname.match(/^\/api\/medication\/([^/]+)\/administer$/);
        if (medicationAdminMatch && request.method === "POST") return await permitted(env.DB, session, "medication.manage", () => administerMedication(request, env.DB, session, decodeURIComponent(medicationAdminMatch[1])));
        if (url.pathname === "/api/medication/daily-mar" && request.method === "GET") return await permitted(env.DB, session, "medication.view", () => dailyMar(env.DB, session, url));
        const medicationStockMatch = url.pathname.match(/^\/api\/medication\/([^/]+)\/stock$/);
        if (medicationStockMatch && request.method === "POST") return await permitted(env.DB, session, "medication.manage", () => adjustMedicationStock(request, env.DB, session, decodeURIComponent(medicationStockMatch[1])));
        const medicationCorrectionMatch = url.pathname.match(/^\/api\/medication\/administrations\/([^/]+)\/correct$/);
        if (medicationCorrectionMatch && request.method === "POST") return await permitted(env.DB, session, "medication.manage", () => correctMedicationAdministration(request, env.DB, session, decodeURIComponent(medicationCorrectionMatch[1])));
        if (url.pathname === "/api/body-map" && request.method === "GET") return await permitted(env.DB, session, "clients.view", () => listBodyMap(env.DB, session, url));
        if (url.pathname === "/api/body-map" && request.method === "POST") return await permitted(env.DB, session, "care_plans.manage", () => createBodyMapRecord(request, env.DB, session));
        const bodyMapUpdateMatch = url.pathname.match(/^\/api\/body-map\/([^/]+)\/update$/);
        if (bodyMapUpdateMatch && request.method === "POST") return await permitted(env.DB, session, "care_plans.manage", () => updateBodyMapRecord(request, env.DB, session, decodeURIComponent(bodyMapUpdateMatch[1])));
        const carePlanActionMatch = url.pathname.match(/^\/api\/care-plans\/([^/]+)\/(approve|generate-visits)$/);
        if (carePlanActionMatch && request.method === "POST") return carePlanAction(request, env.DB, session, decodeURIComponent(carePlanActionMatch[1]), carePlanActionMatch[2]);
        const careAlertMatch = url.pathname.match(/^\/api\/care-delivery\/alerts\/([^/]+)\/acknowledge$/);
        if (careAlertMatch && request.method === "POST") return acknowledgeCareAlert(env.DB, session, decodeURIComponent(careAlertMatch[1]));
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
        if (url.pathname === "/api/organisation/profile" && request.method === "GET") return getOrganisationProfile(env.DB, session);
        if (url.pathname === "/api/organisation/profile" && request.method === "PUT") return updateOrganisationProfile(request, env.DB, session);
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
          if (request.method === "GET") return listBranches(env.DB, session);
          if (request.method === "POST") return createBranch(request, env.DB, session);
        }
        const branchMatch = url.pathname.match(/^\/api\/branches\/([^/]+)$/);
        if (branchMatch && request.method === "PUT") return updateBranch(request, env.DB, session, decodeURIComponent(branchMatch[1]));
        if (url.pathname === "/api/family-access") {
          if (request.method === "GET") return listFamilyAccess(env.DB, session);
          if (request.method === "POST") return saveFamilyAccess(request, env.DB, session);
        }
        if (url.pathname === "/api/staff") {
          if (request.method === "GET") return await permitted(env.DB, session, "staff.view", () => listStaff(env.DB, session, url));
          if (request.method === "POST") return await permitted(env.DB, session, "staff.create", () => createStaff(request, env.DB, session));
          return methodNotAllowed(["GET", "POST"]);
        }
        const staffMatch = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
        if (staffMatch) {
          const id = decodeURIComponent(staffMatch[1]);
          if (request.method === "PUT") return await permitted(env.DB, session, "staff.edit", () => updateStaff(request, env.DB, session, id));
          return methodNotAllowed(["PUT"]);
        }
        const clientCareMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/(care-plans|risks|documents)$/);
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
        const documentMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
        if (documentMatch) {
          const id = decodeURIComponent(documentMatch[1]);
          if (request.method === "DELETE") return await permitted(env.DB, session, "documents.manage", () => archiveDocument(env.DB, session, id));
          return methodNotAllowed(["DELETE"]);
        }
        if (url.pathname === "/api/clients") {
          if (request.method === "GET") return await permitted(env.DB, session, "clients.view", () => listClients(env.DB, session, url));
          if (request.method === "POST") return await permitted(env.DB, session, "clients.create", () => createClient(request, env.DB, session));
          return methodNotAllowed(["GET", "POST"]);
        }
        const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
        if (clientMatch) {
          const id = decodeURIComponent(clientMatch[1]);
          if (request.method === "GET") return await permitted(env.DB, session, "clients.view", () => getClient(env.DB, session, id));
          if (request.method === "PUT") return await permitted(env.DB, session, "clients.edit", () => updateClient(request, env.DB, session, id));
          if (request.method === "DELETE") return await permitted(env.DB, session, "clients.archive", () => archiveClient(env.DB, session, id));
          return methodNotAllowed(["GET", "PUT", "DELETE"]);
        }
        if (url.pathname === "/api/users") {
          if (request.method === "GET") return listUsers(env.DB, session);
          if (request.method === "POST") return createUser(request, env.DB, session);
          return methodNotAllowed(["GET", "POST"]);
        }
        const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
        if (userMatch && request.method === "PUT") return updateUser(request, env.DB, session, decodeURIComponent(userMatch[1]));
        if (url.pathname === "/api/audit" && request.method === "GET") return listAudit(env.DB, session, url);
        if (url.pathname === "/api/organisation" && request.method === "PUT") return updateOrganisation(request, env.DB, session);
        return json({ error: { code: "API_ROUTE_NOT_FOUND", message: "The requested API route does not exist." } }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("CoreCare request failed", error);
      return json({ error: { code: "INTERNAL_ERROR", message: "CoreCare could not complete the request." } }, 500);
    }
  }
};

function health(env) {
  return json({ ok: true, service: "corecare", version: VERSION, database: Boolean(env.DB), authentication: Boolean(env.DB), timestamp: new Date().toISOString() });
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

  const user = await env.DB.prepare(`SELECT u.id,u.organisation_id,u.email,u.display_name,u.role,u.access_level,u.is_platform_user,u.home_branch_id,u.status,u.password_hash,u.password_salt,u.password_iterations,u.must_change_password,o.name AS organisation_name FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE lower(u.email)=lower(?) LIMIT 1`).bind(email).first();
  const valid = user && user.status === "active" && user.password_hash && user.password_salt
    ? await verifyPassword(password, user.password_salt, user.password_hash, user.password_iterations || PASSWORD_ITERATIONS)
    : false;
  if (!valid) {
    await recordFailedLogin(env.DB, attemptKey, email, ip, attempt);
    return json({ error: { code: "INVALID_CREDENTIALS", message: "The email address or password is incorrect." } }, 401);
  }

  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  const token = randomToken();
  const tokenHash = await sha256Base64(token);
  const expires = new Date(Date.now() + SESSION_HOURS * 3600000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.DB.prepare("INSERT INTO sessions (id,user_id,organisation_id,active_branch_id,token_hash,expires_at,user_agent,ip_hint) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), user.id, user.organisation_id, user.home_branch_id, tokenHash, expires.toISOString(), clean(request.headers.get("user-agent")).slice(0, 250), ip),
    env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id),
    env.DB.prepare("INSERT INTO login_history(id,organisation_id,user_id,outcome,reason,ip_hint,user_agent) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user.organisation_id,user.id,"success","Password sign-in",ip,clean(request.headers.get("user-agent")).slice(0,250)),
    auditStatement(env.DB, user.organisation_id, user.id, "user.login", "user", user.id, { email: user.email })
  ]);
  return json({ user: publicUser(user), expiresAt: expires.toISOString() }, 200, { "set-cookie": sessionCookie(token, expires) });
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
  const session = await requireSession(request, env.DB);
  if (session instanceof Response) return session;
  const access = await buildAccessProfile(env.DB, session);
  return json({ user: {...publicUser(session), permissions: access.permissions, modules: access.modules}, expiresAt: session.expires_at });
}

async function requireSession(request, db) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return unauthorised();
  const row = await db.prepare(`SELECT s.id AS session_id,s.expires_at,s.user_id,s.organisation_id,s.active_branch_id,s.support_mode,s.support_origin_organisation_id,s.support_started_at,
    (SELECT ss.reason FROM support_sessions ss WHERE ss.session_id=s.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS support_reason,
    (SELECT ss.access_mode FROM support_sessions ss WHERE ss.session_id=s.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS support_access_mode,
    u.email,u.display_name,u.role,u.access_level,u.is_platform_user,u.home_branch_id,u.staff_id,u.status,u.must_change_password,o.name AS organisation_name,b.name AS branch_name
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN organisations o ON o.id=s.organisation_id LEFT JOIN branches b ON b.id=s.active_branch_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(await sha256Base64(token)).first();
  if (!row || row.status !== "active") return unauthorised();
  await db.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.session_id).run();
  return row;
}

async function changePassword(request, db, session) {
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
  return json({ ok: true });
}

function branchRestricted(session){ return !session.is_platform_user && ["branch_manager","senior_carer","carer","office_staff"].includes(session.access_level) && Boolean(session.active_branch_id || session.home_branch_id); }
function activeBranch(session){ return session.active_branch_id || session.home_branch_id || null; }
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

async function createClient(request, db, session) {
  if (!hasRole(session, ["owner", "manager", "carer"])) return forbidden();
  const raw = await readJson(request);
  const input = normaliseClient(raw);
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const id = crypto.randomUUID();
  const fields = clientFields(input);
  const requirements = normaliseVisitRequirements(raw.visitRequirements, raw.visitStartDate);
  const statements = [
    db.prepare(`INSERT INTO clients (id,organisation_id,branch_id,${fields.names.join(",")}) VALUES (?, ?, ?, ${fields.names.map(() => "?").join(",")})`).bind(id, session.organisation_id, activeBranch(session), ...fields.values),
    db.prepare(`INSERT INTO client_visit_codes(id,organisation_id,client_id,code,active,created_by) VALUES(?,?,?,?,1,?)`).bind(crypto.randomUUID(),session.organisation_id,id,'CC-'+crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase(),session.user_id),
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
    statements.push(db.prepare(`INSERT OR IGNORE INTO care_visits(id,organisation_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,requirement_id,requirement_occurrence_date,created_by,protected_time_rule,protected_time_reason,protected_window_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,clientId,null,requirement.visitType,start.toISOString(),end.toISOString(),'scheduled','requirement','draft',requirementId,'requirement',requirementId,day,session.user_id,requirement.schedulingRule,requirement.timeCriticalReason,requirement.windowMinutes));
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
  if(!hasRole(session,['owner','manager','carer']))return forbidden();
  const input=await readJson(request),requirements=normaliseVisitRequirements(input.requirements,input.startDate);
  if(!requirements.length)return json({error:{code:'VALIDATION_ERROR',message:'Add at least one valid visit requirement.'}},400);
  const client=await db.prepare('SELECT id FROM clients WHERE id=? AND organisation_id=?').bind(clientId,session.organisation_id).first();if(!client)return notFound('Client');
  const statements=[];
  for(const r of requirements)statements.push(...visitRequirementStatements(db,session,clientId,r));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'client.visit_requirements_created','client',clientId,{count:requirements.length}));
  await db.batch(statements);return json({ok:true,requirementsCreated:requirements.length,visitsGenerated:requirements.reduce((n,r)=>n+generatedOccurrenceCount(r),0)});
}

async function updateClient(request, db, session, id) {
  if (!hasRole(session, ["owner", "manager", "carer"])) return forbidden();
  const raw = await readJson(request);
  const input = normaliseClient(raw);
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const fields = clientFields(input);
  const assignments = fields.names.map(name => `${name}=?`).join(",");
  const existing = await db.prepare(`SELECT id FROM clients WHERE id=? AND organisation_id=? LIMIT 1`).bind(id,session.organisation_id).first();
  if (!existing) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
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
  if (!hasRole(session, ["owner", "manager"])) return forbidden();
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
      WHERE v.organisation_id=? AND date(v.scheduled_start) BETWEEN date(?,'-1 day') AND date(?,'+1 day') AND v.rota_status!='cancelled'
      ORDER BY v.scheduled_start`).bind(org,from,to).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? AND status='Active' ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT * FROM staff_working_patterns WHERE organisation_id=? AND status='active' ORDER BY staff_id,week_number,day_of_week,start_time`).bind(org).all(),
    db.prepare(`SELECT * FROM client_visit_requirements WHERE organisation_id=? AND status='active'`).bind(org).all(),
    db.prepare(`SELECT client_id,staff_id FROM client_staff_assignments WHERE organisation_id=?`).bind(org).all()
  ]);
  const rows=visits.results||[], now=Date.now();
  rows.forEach(v=>{const start=new Date(v.scheduled_start).getTime(),end=v.scheduled_end?new Date(v.scheduled_end).getTime():start+3600000;v.live_status=v.status==='scheduled'&&start<now?'late':v.status==='in_progress'&&end<now?'overrunning':v.status;});
  const stats={total:rows.length,unallocated:rows.filter(x=>!x.staff_id).length,late:rows.filter(x=>x.live_status==='late').length,inProgress:rows.filter(x=>x.status==='in_progress').length,completed:rows.filter(x=>x.status==='completed').length};
  return json({from,to,visits:rows,clients:clients.results||[],staff:staff.results||[],workingPatterns:patterns.results||[],requirements:requirements.results||[],preferredAssignments:assignments.results||[],stats});
}

async function listRotaTemplates(db,session){
  if(!await userHasPermission(db,session,'rota.templates.view')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const org=session.organisation_id;
  const [visitTemplates,patterns,exceptions,runs,clients,staff]=await Promise.all([
    db.prepare(`SELECT t.*,c.first_name||' '||c.last_name client_name,p.first_name||' '||p.last_name preferred_staff_name,b.first_name||' '||b.last_name backup_staff_name FROM rota_visit_templates t LEFT JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id LEFT JOIN staff p ON p.id=t.preferred_staff_id AND p.organisation_id=t.organisation_id LEFT JOIN staff b ON b.id=t.backup_staff_id AND b.organisation_id=t.organisation_id WHERE t.organisation_id=? ORDER BY t.day_of_week,t.preferred_time,c.last_name`).bind(org).all(),
    db.prepare(`SELECT w.*,s.first_name||' '||s.last_name staff_name FROM staff_working_patterns w LEFT JOIN staff s ON s.id=w.staff_id AND s.organisation_id=w.organisation_id WHERE w.organisation_id=? ORDER BY s.last_name,w.week_number,w.day_of_week,w.start_time`).bind(org).all(),
    db.prepare(`SELECT e.*,s.first_name||' '||s.last_name staff_name,c.first_name||' '||c.last_name client_name,r.first_name||' '||r.last_name replacement_staff_name FROM rota_template_exceptions e LEFT JOIN staff s ON s.id=e.staff_id AND s.organisation_id=e.organisation_id LEFT JOIN clients c ON c.id=e.client_id AND c.organisation_id=e.organisation_id LEFT JOIN staff r ON r.id=e.replacement_staff_id AND r.organisation_id=e.organisation_id WHERE e.organisation_id=? AND datetime(COALESCE(e.end_at,e.start_at))>=datetime('now','-30 day') ORDER BY e.start_at DESC`).bind(org).all(),
    db.prepare(`SELECT * FROM rota_generation_runs WHERE organisation_id=? ORDER BY generated_at DESC LIMIT 12`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? AND status='Active' ORDER BY first_name,last_name`).bind(org).all()
  ]);
  return json({visitTemplates:visitTemplates.results||[],workingPatterns:patterns.results||[],exceptions:exceptions.results||[],runs:runs.results||[],clients:clients.results||[],staff:staff.results||[]});
}
async function saveRotaVisitTemplate(request,db,session){
  if(!await userHasPermission(db,session,'rota.templates.manage')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const i=await readJson(request),clientId=clean(i.clientId),time=clean(i.preferredTime),day=Number(i.dayOfWeek),duration=Math.max(15,Number(i.durationMinutes)||30);
  if(!clientId||!time||day<1||day>7)return json({error:{code:'VALIDATION_ERROR',message:'Select a client, day and preferred time.'}},400);
  const id=clean(i.id)||crypto.randomUUID();
  await db.batch([db.prepare(`INSERT INTO rota_visit_templates(id,organisation_id,client_id,name,visit_type,day_of_week,preferred_time,duration_minutes,carers_required,preferred_staff_id,backup_staff_id,window_minutes,effective_from,effective_to,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,name=excluded.name,visit_type=excluded.visit_type,day_of_week=excluded.day_of_week,preferred_time=excluded.preferred_time,duration_minutes=excluded.duration_minutes,carers_required=excluded.carers_required,preferred_staff_id=excluded.preferred_staff_id,backup_staff_id=excluded.backup_staff_id,window_minutes=excluded.window_minutes,effective_from=excluded.effective_from,effective_to=excluded.effective_to,status=excluded.status,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,clientId,clean(i.name)||'Recurring care visit',clean(i.visitType)||'Care visit',day,time,duration,Math.max(1,Number(i.carersRequired)||1),clean(i.preferredStaffId)||null,clean(i.backupStaffId)||null,Math.max(0,Number(i.windowMinutes)||15),clean(i.effectiveFrom)||null,clean(i.effectiveTo)||null,clean(i.status)||'active',clean(i.notes),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'rota.template_saved','rota_visit_template',id,{clientId,day,time})]);return json({ok:true,id});
}
async function saveWorkingPattern(request,db,session){
  if(!await userHasPermission(db,session,'rota.templates.manage')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const i=await readJson(request),staffId=clean(i.staffId),day=Number(i.dayOfWeek),start=clean(i.startTime),end=clean(i.endTime),cycle=Math.min(8,Math.max(1,Number(i.cycleWeeks)||1)),week=Math.min(cycle,Math.max(1,Number(i.weekNumber)||1));
  if(!staffId||day<1||day>7||!start||!end||end<=start)return json({error:{code:'VALIDATION_ERROR',message:'Select a carer, day and valid start/end times.'}},400);
  const id=clean(i.id)||crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO staff_working_patterns(id,organisation_id,staff_id,name,cycle_weeks,week_number,day_of_week,start_time,end_time,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET staff_id=excluded.staff_id,name=excluded.name,cycle_weeks=excluded.cycle_weeks,week_number=excluded.week_number,day_of_week=excluded.day_of_week,start_time=excluded.start_time,end_time=excluded.end_time,status=excluded.status,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,staffId,clean(i.name)||'Normal working pattern',cycle,week,day,start,end,clean(i.status)||'active',session.user_id),auditStatement(db,session.organisation_id,session.user_id,'rota.working_pattern_saved','staff_working_pattern',id,{staffId,day,start,end})]);return json({ok:true,id});
}
async function saveRotaException(request,db,session){
  if(!await userHasPermission(db,session,'rota.templates.manage')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const i=await readJson(request),start=clean(i.startAt),type=clean(i.exceptionType)||'other';if(!start)return json({error:{code:'VALIDATION_ERROR',message:'Enter the exception start date and time.'}},400);
  const id=clean(i.id)||crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO rota_template_exceptions(id,organisation_id,exception_type,staff_id,client_id,template_id,start_at,end_at,action,replacement_staff_id,reason,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET exception_type=excluded.exception_type,staff_id=excluded.staff_id,client_id=excluded.client_id,template_id=excluded.template_id,start_at=excluded.start_at,end_at=excluded.end_at,action=excluded.action,replacement_staff_id=excluded.replacement_staff_id,reason=excluded.reason`).bind(id,session.organisation_id,type,clean(i.staffId)||null,clean(i.clientId)||null,clean(i.templateId)||null,start,clean(i.endAt)||null,clean(i.action)||'exclude',clean(i.replacementStaffId)||null,clean(i.reason),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'rota.exception_saved','rota_exception',id,{type,start})]);return json({ok:true,id});
}
async function deleteRotaTemplateItem(db,session,type,id){
  if(!await userHasPermission(db,session,'rota.templates.manage')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const table=type==='visit'?'rota_visit_templates':type==='working-pattern'?'staff_working_patterns':'rota_template_exceptions';await db.batch([db.prepare(`DELETE FROM ${table} WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'rota.template_deleted',type,id,{})]);return json({ok:true});
}
function mondayOf(value){const d=new Date(`${value}T00:00:00`);const shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d;}
async function generateRotaFromTemplates(request,env,session){
  const db=env.DB;if(!await userHasPermission(db,session,'rota.templates.generate')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const i=await readJson(request),weekValue=clean(i.weekCommencing);if(!weekValue)return json({error:{code:'VALIDATION_ERROR',message:'Select a week to generate.'}},400);const week=mondayOf(weekValue),weekEnd=new Date(week);weekEnd.setDate(weekEnd.getDate()+7);const mode=['fill','regenerate'].includes(clean(i.mode))?clean(i.mode):'fill';
  if(mode==='regenerate')await db.prepare(`DELETE FROM care_visits WHERE organisation_id=? AND rota_source='template' AND status='scheduled' AND datetime(scheduled_start)>=datetime(?) AND datetime(scheduled_start)<datetime(?) AND COALESCE(manually_overridden,0)=0`).bind(session.organisation_id,week.toISOString(),weekEnd.toISOString()).run();
  const templates=(await db.prepare(`SELECT * FROM rota_visit_templates WHERE organisation_id=? AND status='active' ORDER BY day_of_week,preferred_time`).bind(session.organisation_id).all()).results||[];let created=0,skipped=0,unallocated=0;const warnings=[],statements=[];
  for(const t of templates){const day=new Date(week);day.setDate(day.getDate()+Number(t.day_of_week)-1);const date=day.toISOString().slice(0,10);if(t.effective_from&&date<t.effective_from){skipped++;continue}if(t.effective_to&&date>t.effective_to){skipped++;continue}const interval=Math.max(1,Number(t.interval_weeks)||1);if(interval>1&&t.effective_from){const origin=mondayOf(t.effective_from),weeks=Math.floor((week-origin)/(7*86400000));if(weeks<0||weeks%interval!==0){skipped++;continue}}if(Number(t.end_after_occurrences)>0){const made=await db.prepare(`SELECT COUNT(*) count FROM care_visits WHERE organisation_id=? AND template_id=? AND status!='cancelled'`).bind(session.organisation_id,t.id).first();if(Number(made?.count||0)>=Number(t.end_after_occurrences)){skipped++;continue}}
    const start=new Date(`${date}T${t.preferred_time}:00`),end=new Date(start.getTime()+Number(t.duration_minutes)*60000);
    const duplicate=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND template_id=? AND date(scheduled_start)=date(?) AND status!='cancelled' LIMIT 1`).bind(session.organisation_id,t.id,start.toISOString()).first();if(duplicate){skipped++;continue}
    const ex=await db.prepare(`SELECT * FROM rota_template_exceptions WHERE organisation_id=? AND (template_id=? OR client_id=? OR staff_id IN (?,?)) AND datetime(start_at)<=datetime(?) AND datetime(COALESCE(end_at,start_at,'9999-12-31'))>=datetime(?) ORDER BY created_at DESC LIMIT 1`).bind(session.organisation_id,t.id,t.client_id,t.preferred_staff_id||'',t.backup_staff_id||'',end.toISOString(),start.toISOString()).first();if(ex&&ex.action==='exclude'){skipped++;warnings.push(`${t.name}: skipped due to ${ex.exception_type}`);continue}
    let staffId=ex?.replacement_staff_id||t.preferred_staff_id||null;
    async function available(candidate){if(!candidate)return false;const clash=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND staff_id=? AND status!='cancelled' AND datetime(scheduled_start)<datetime(?) AND datetime(COALESCE(scheduled_end,scheduled_start))>datetime(?) LIMIT 1`).bind(session.organisation_id,candidate,end.toISOString(),start.toISOString()).first();if(clash)return false;const pattern=await db.prepare(`SELECT id FROM staff_working_patterns WHERE organisation_id=? AND staff_id=? AND status='active' AND day_of_week=? AND time(start_time)<=time(?) AND time(end_time)>=time(?) LIMIT 1`).bind(session.organisation_id,candidate,t.day_of_week,t.preferred_time,end.toISOString().slice(11,16)).first();return Boolean(pattern)}
    if(staffId&&!await available(staffId))staffId=t.backup_staff_id&&await available(t.backup_staff_id)?t.backup_staff_id:null;
    if(!staffId){unallocated++;warnings.push(`${t.name}: left in allocation queue`)}
    const id=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO care_visits(id,organisation_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,template_id,published_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).bind(id,session.organisation_id,t.client_id,staffId,t.visit_type,start.toISOString(),end.toISOString(),'scheduled','template','draft',t.id,'weekly_template',t.id,session.user_id));created++;
  }
  const runId=crypto.randomUUID();statements.push(db.prepare(`INSERT INTO rota_generation_runs(id,organisation_id,week_commencing,templates_considered,visits_created,visits_skipped,visits_unallocated,warnings_json,generated_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(runId,session.organisation_id,week.toISOString().slice(0,10),templates.length,created,skipped,unallocated,JSON.stringify(warnings),session.user_id));statements.push(auditStatement(db,session.organisation_id,session.user_id,'rota.week_generated','rota_generation',runId,{week:weekValue,created,skipped,unallocated,mode}));if(statements.length)await db.batch(statements);
  const staffDays=(await db.prepare(`SELECT DISTINCT staff_id,date(scheduled_start) day FROM care_visits WHERE organisation_id=? AND staff_id IS NOT NULL AND datetime(scheduled_start)>=datetime(?) AND datetime(scheduled_start)<datetime(?)`).bind(session.organisation_id,week.toISOString(),weekEnd.toISOString()).all()).results||[];for(const x of staffDays)await recalculateStaffTravel(env,session,x.staff_id,x.day);
  return json({ok:true,runId,templates:templates.length,created,skipped,unallocated,warnings});
}

async function createRotaVisit(request,env,session){
  const db=env.DB;
  const i=await readJson(request),clientId=clean(i.clientId),start=clean(i.scheduledStart);
  if(!clientId||!start)return json({error:{code:'VALIDATION_ERROR',message:'Select a client and start time.'}},400);
  const staffId=clean(i.staffId)||null,end=clean(i.scheduledEnd)||null;
  if(staffId){const clash=await db.prepare(`SELECT id FROM care_visits WHERE organisation_id=? AND staff_id=? AND rota_status!='cancelled' AND status!='cancelled' AND datetime(scheduled_start)<datetime(COALESCE(?,?,'9999-12-31')) AND datetime(COALESCE(scheduled_end,scheduled_start,'9999-12-31'))>datetime(?) LIMIT 1`).bind(session.organisation_id,staffId,end,start,start).first();if(clash)return json({error:{code:'ROTA_CLASH',message:'This staff member already has an overlapping visit.'}},409);}
  const id=crypto.randomUUID(),recurrence=clean(i.recurrence)||'none',group=recurrence==='none'?null:crypto.randomUUID();
  const occurrences=[];let cursor=new Date(start),finish=end?new Date(end):null,count=recurrence==='weekly'?Math.min(Number(i.occurrences)||4,52):1;
  for(let n=0;n<count;n++){const vid=n===0?id:crypto.randomUUID();occurrences.push(db.prepare(`INSERT INTO care_visits(id,organisation_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,published_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).bind(vid,session.organisation_id,clientId,staffId,clean(i.visitType)||'Care visit',cursor.toISOString(),finish?finish.toISOString():null,'scheduled','rota','published',group,recurrence,session.user_id));cursor=new Date(cursor.getTime()+7*86400000);if(finish)finish=new Date(finish.getTime()+7*86400000);}
  occurrences.push(auditStatement(db,session.organisation_id,session.user_id,'rota.visit_published','visit',id,{clientId,staffId,recurrence,count}));
  await db.batch(occurrences);return json({ok:true,id,created:count});
}

async function manageVisitRecurrence(request,db,session,id){
  if(!await userHasPermission(db,session,'rota.templates.manage')&&!hasRole(session,['owner','manager','scheduler','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const visit=await db.prepare(`SELECT * FROM care_visits WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id).first();if(!visit)return notFound('Rota visit');
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
  const managerSession={...session,user_id:manager.id,role:manager.role,access_level:manager.access_level,is_platform_user:false};
  const allowed=['owner','manager'].includes(manager.role)||['organisation_owner','organisation_admin','branch_manager'].includes(manager.access_level)||await userHasPermission(db,managerSession,'rota.time_critical.override');
  if(!allowed)return {error:json({error:{code:'MANAGER_AUTH_FORBIDDEN',message:'This account is not authorised to override protected visit times.'}},403)};
  return {manager,reason,statement:db.prepare(`INSERT INTO protected_visit_authorisations(id,organisation_id,visit_id,requested_by,authorised_by,previous_start,new_start,reason) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visit.id,session.user_id,manager.id,visit.scheduled_start,newStart,reason)};
}

async function updateRotaVisit(request,env,session,id){
  const db=env.DB;
  const i=await readJson(request),row=await db.prepare(`SELECT * FROM care_visits WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id).first();if(!row)return notFound('Rota visit');
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
async function cancelRotaVisit(request,db,session,id){const i=await readJson(request);const row=await db.prepare(`SELECT status FROM care_visits WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id).first();if(!row)return notFound('Rota visit');if(row.status==='completed')return json({error:{code:'VISIT_COMPLETED',message:'A completed visit cannot be cancelled.'}},409);await db.batch([db.prepare(`UPDATE care_visits SET status='cancelled',rota_status='cancelled',cancelled_at=CURRENT_TIMESTAMP,cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.reason)||'Cancelled from rota',id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'rota.visit_cancelled','visit',id,{reason:i.reason})]);return json({ok:true});}


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
  const org=session.organisation_id;
  const [visits,clients,staff,codes]=await Promise.all([
    db.prepare(`SELECT v.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id WHERE v.organisation_id=? AND date(v.scheduled_start)=date('now') ORDER BY v.scheduled_start`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? AND status='Active' ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT client_id,code FROM client_visit_codes WHERE organisation_id=? AND active=1`).bind(org).all()
  ]);
  const rows=visits.results||[], now=Date.now();
  rows.forEach(v=>{if(v.status==='scheduled'&&new Date(v.scheduled_start).getTime()+15*60000<now)v.live_status='late';else if(v.status==='in_progress'&&v.scheduled_end&&new Date(v.scheduled_end).getTime()<now)v.live_status='overrunning';else v.live_status=v.status;});
  const stats={scheduled:rows.filter(x=>x.status==='scheduled').length,inProgress:rows.filter(x=>x.status==='in_progress').length,late:rows.filter(x=>x.live_status==='late').length,completed:rows.filter(x=>x.status==='completed').length,overrunning:rows.filter(x=>x.live_status==='overrunning').length};
  return json({visits:rows,clients:clients.results||[],staff:staff.results||[],codes:codes.results||[],stats});
}
async function createVisit(request,db,session){const i=await readJson(request);if(!clean(i.clientId)||!clean(i.scheduledStart))return json({error:{code:'VALIDATION_ERROR',message:'Select a client and scheduled start.'}},400);const id=crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO care_visits(id,organisation_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,rota_source,rota_status,published_at,created_by) VALUES(?,?,?,?,?,?,?,'manual','published',CURRENT_TIMESTAMP,?)`).bind(id,session.organisation_id,clean(i.clientId),clean(i.staffId)||null,clean(i.visitType)||'Care visit',clean(i.scheduledStart),clean(i.scheduledEnd)||null,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'visits.created','visit',id,{clientId:i.clientId})]);return json({ok:true,id});}
async function getVisitCareRecord(db,session,visitId){
  const visit=await db.prepare(`SELECT v.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name FROM care_visits v LEFT JOIN clients c ON c.id=v.client_id AND c.organisation_id=v.organisation_id LEFT JOIN staff s ON s.id=v.staff_id AND s.organisation_id=v.organisation_id WHERE v.id=? AND v.organisation_id=?`).bind(visitId,session.organisation_id).first();
  if(!visit)return notFound('Visit');
  if(['carer','senior_carer'].includes(session.access_level)&&(!session.staff_id||visit.staff_id!==session.staff_id))return forbidden('This visit is allocated to another care worker.');
  const [record,tasks,medication]=await Promise.all([
    db.prepare(`SELECT * FROM visit_care_records WHERE organisation_id=? AND visit_id=?`).bind(session.organisation_id,visitId).first(),
    db.prepare(`SELECT * FROM visit_task_records WHERE organisation_id=? AND visit_id=? ORDER BY recorded_at`).bind(session.organisation_id,visitId).all(),
    db.prepare(`SELECT * FROM visit_medication_records WHERE organisation_id=? AND visit_id=? ORDER BY recorded_at`).bind(session.organisation_id,visitId).all()
  ]);
  return json({visit,record:record||null,tasks:tasks.results||[],medication:medication.results||[]});
}
async function saveVisitCareRecord(request,db,session,visitId){
  const i=await readJson(request),visit=await db.prepare(`SELECT * FROM care_visits WHERE id=? AND organisation_id=?`).bind(visitId,session.organisation_id).first();
  if(!visit)return notFound('Visit');
  if(['carer','senior_carer'].includes(session.access_level)&&(!session.staff_id||visit.staff_id!==session.staff_id))return forbidden('This visit is allocated to another care worker.');
  if(!['in_progress','completed'].includes(visit.status))return json({error:{code:'VISIT_NOT_STARTED',message:'Clock into the visit before recording care delivery.'}},409);
  const notes=clean(i.careNotes);if(!notes)return json({error:{code:'VALIDATION_ERROR',message:'Enter the care notes before completing the visit.'}},400);
  const recordId=crypto.randomUUID(),tasks=Array.isArray(i.tasks)?i.tasks:[],meds=Array.isArray(i.medication)?i.medication:[],statements=[];
  statements.push(db.prepare(`INSERT INTO visit_care_records(id,organisation_id,visit_id,client_id,staff_id,mood,wellbeing,care_notes,fluid_intake_ml,nutrition,toileting,mobility_support,skin_observation,body_map_notes,follow_up_required,follow_up_notes,completed_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id,visit_id) DO UPDATE SET mood=excluded.mood,wellbeing=excluded.wellbeing,care_notes=excluded.care_notes,fluid_intake_ml=excluded.fluid_intake_ml,nutrition=excluded.nutrition,toileting=excluded.toileting,mobility_support=excluded.mobility_support,skin_observation=excluded.skin_observation,body_map_notes=excluded.body_map_notes,follow_up_required=excluded.follow_up_required,follow_up_notes=excluded.follow_up_notes,completed_by=excluded.completed_by,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(recordId,session.organisation_id,visitId,visit.client_id,visit.staff_id||session.staff_id||null,clean(i.mood)||'not_recorded',clean(i.wellbeing)||'no_change',notes,Math.max(0,Number(i.fluidIntakeMl)||0),clean(i.nutrition)||'not_recorded',clean(i.toileting)||'not_recorded',clean(i.mobilitySupport),clean(i.skinObservation),clean(i.bodyMapNotes),i.followUpRequired?1:0,clean(i.followUpNotes),session.user_id));
  statements.push(db.prepare(`DELETE FROM visit_task_records WHERE organisation_id=? AND visit_id=?`).bind(session.organisation_id,visitId));
  for(const task of tasks){if(!clean(task.key)||!clean(task.label))continue;statements.push(db.prepare(`INSERT INTO visit_task_records(id,organisation_id,visit_id,task_key,task_label,status,notes,recorded_by) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visitId,clean(task.key),clean(task.label),clean(task.status)||'completed',clean(task.notes),session.user_id));}
  statements.push(db.prepare(`DELETE FROM visit_medication_records WHERE organisation_id=? AND visit_id=?`).bind(session.organisation_id,visitId));
  for(const med of meds){if(!clean(med.outcome)||clean(med.outcome)==='not_required')continue;statements.push(db.prepare(`INSERT INTO visit_medication_records(id,organisation_id,visit_id,client_id,medication_name,outcome,reason,signature_name,recorded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visitId,visit.client_id,clean(med.name)||'Scheduled medication',clean(med.outcome),clean(med.reason),clean(med.signatureName)||clean(session.display_name)||'CoreCare user',session.user_id));}
  const complete=i.completeVisit!==false;
  if(complete)statements.push(db.prepare(`UPDATE care_visits SET status='completed',actual_end=COALESCE(actual_end,CURRENT_TIMESTAMP),notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(notes,visitId,session.organisation_id));
  if(i.followUpRequired)statements.push(db.prepare(`INSERT INTO operations_tasks(id,organisation_id,client_id,title,description,priority,status,due_at,created_by) VALUES(?,?,?,?,?,'high','open',datetime('now','+1 day'),?)`).bind(crypto.randomUUID(),session.organisation_id,visit.client_id,'Care visit follow-up',clean(i.followUpNotes)||'Review follow-up raised from the care visit.',session.user_id));
  if(i.incidentRequired&&clean(i.incidentTitle))statements.push(db.prepare(`INSERT INTO operations_incidents(id,organisation_id,client_id,title,description,severity,status,reported_by) VALUES(?,?,?,?,?,?, 'open',?)`).bind(crypto.randomUUID(),session.organisation_id,visit.client_id,clean(i.incidentTitle),clean(i.incidentDetails),clean(i.incidentSeverity)||'medium',session.user_id));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'care_delivery.visit_recorded','visit',visitId,{tasks:tasks.length,medication:meds.length,followUp:Boolean(i.followUpRequired),incident:Boolean(i.incidentRequired),completed:complete}));
  await db.batch(statements);return json({ok:true,visitId,status:complete?'completed':visit.status});
}
async function ensureClientVisitCode(request,db,session){const i=await readJson(request),clientId=clean(i.clientId),regenerate=Boolean(i.regenerate);if(!clientId)return json({error:{code:'VALIDATION_ERROR',message:'Select a client.'}},400);const client=await db.prepare('SELECT id,first_name,last_name FROM clients WHERE id=? AND organisation_id=? AND archived_at IS NULL').bind(clientId,session.organisation_id).first();if(!client)return notFound('Client');let row=await db.prepare('SELECT code,created_at FROM client_visit_codes WHERE organisation_id=? AND client_id=? AND active=1 ORDER BY created_at DESC').bind(session.organisation_id,clientId).first();if(regenerate){if(!hasRole(session,['owner','manager','organisation_owner','organisation_admin','branch_manager']))return forbidden();const code='CC-'+crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase();await db.batch([db.prepare('UPDATE client_visit_codes SET active=0 WHERE organisation_id=? AND client_id=? AND active=1').bind(session.organisation_id,clientId),db.prepare('INSERT INTO client_visit_codes(id,organisation_id,client_id,code,active,created_by) VALUES(?,?,?,?,1,?)').bind(crypto.randomUUID(),session.organisation_id,clientId,code,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'client.verification_code_regenerated','client',clientId,{client:`${client.first_name} ${client.last_name}`})]);row={code,created_at:new Date().toISOString()};}else if(!row){const code='CC-'+crypto.randomUUID().replaceAll('-','').slice(0,20).toUpperCase();await db.prepare('INSERT INTO client_visit_codes(id,organisation_id,client_id,code,active,created_by) VALUES(?,?,?,?,1,?)').bind(crypto.randomUUID(),session.organisation_id,clientId,code,session.user_id).run();row={code,created_at:new Date().toISOString()};}return json({ok:true,code:row.code,createdAt:row.created_at,clientName:`${client.first_name} ${client.last_name}`});}

async function syncVisitEvents(request,db,session){const i=await readJson(request),events=Array.isArray(i.events)?i.events:[];const results=[];for(const event of events){const eventId=clean(event.eventId),code=clean(event.code),type=clean(event.type),deviceTime=clean(event.deviceTime);if(!eventId||!code||!['clock_in','clock_out'].includes(type)||!deviceTime){results.push({eventId,ok:false,error:'Invalid event'});continue;}const existing=await db.prepare('SELECT id FROM visit_events WHERE device_event_id=? AND organisation_id=?').bind(eventId,session.organisation_id).first();if(existing){results.push({eventId,ok:true,duplicate:true});continue;}const clientCode=await db.prepare('SELECT client_id FROM client_visit_codes WHERE organisation_id=? AND code=? AND active=1').bind(session.organisation_id,code).first();if(!clientCode){results.push({eventId,ok:false,error:'Invalid or inactive client code'});continue;}const isCarer=['carer','senior_carer'].includes(session.access_level);if(isCarer&&!session.staff_id){results.push({eventId,ok:false,error:'Your login is not linked to a staff record. Ask a manager to update your staff profile.'});continue;}const staffFilter=session.staff_id?`AND staff_id=?`:'';
const visitSql=`SELECT id,status,staff_id FROM care_visits WHERE organisation_id=? AND client_id=? ${staffFilter} AND date(scheduled_start)=date(?) AND status IN ('scheduled','in_progress') ORDER BY CASE WHEN status='in_progress' THEN 0 ELSE 1 END, CASE WHEN staff_id IS NOT NULL THEN 0 ELSE 1 END, ABS(strftime('%s',scheduled_start)-strftime('%s',?)) LIMIT 1`;
let visit=session.staff_id
  ?await db.prepare(visitSql).bind(session.organisation_id,clientCode.client_id,session.staff_id,deviceTime,deviceTime).first()
  :await db.prepare(visitSql).bind(session.organisation_id,clientCode.client_id,deviceTime,deviceTime).first();if(!visit){results.push({eventId,ok:false,error:'No matching visit found'});continue;}if(type==='clock_in'&&visit.status!=='scheduled'){results.push({eventId,ok:true,duplicate:true});continue;}if(type==='clock_out'&&visit.status!=='in_progress'){results.push({eventId,ok:false,error:'Visit is not clocked in'});continue;}const source=clean(event.source)||'online';const update=type==='clock_in'?db.prepare(`UPDATE care_visits SET status='in_progress',actual_start=?,clock_in_method='qr',clock_in_device_time=?,clock_in_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(deviceTime,deviceTime,visit.id,session.organisation_id):db.prepare(`UPDATE care_visits SET status='completed',actual_end=?,clock_out_method='qr',clock_out_device_time=?,clock_out_received_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(deviceTime,deviceTime,visit.id,session.organisation_id);await db.batch([update,db.prepare(`INSERT INTO visit_events(id,organisation_id,visit_id,event_type,device_event_id,device_time,source,payload_json,created_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,visit.id,type,eventId,deviceTime,source,JSON.stringify(event),session.user_id),auditStatement(db,session.organisation_id,session.user_id,`visits.${type}`,'visit',visit.id,{deviceTime,source})]);results.push({eventId,ok:true,visitId:visit.id});}return json({ok:true,results,receivedAt:new Date().toISOString()});}

async function operationsBoard(db, session) {
  const org=session.organisation_id;
  const [tasks,incidents,handovers,clients,staff,careDue,riskDue]=await Promise.all([
    db.prepare(`SELECT t.*,c.first_name||' '||c.last_name client_name,s.first_name||' '||s.last_name staff_name FROM operations_tasks t LEFT JOIN clients c ON c.id=t.client_id AND c.organisation_id=t.organisation_id LEFT JOIN staff s ON s.id=t.assigned_staff_id AND s.organisation_id=t.organisation_id WHERE t.organisation_id=? ORDER BY CASE t.status WHEN 'escalated' THEN 1 WHEN 'overdue' THEN 2 WHEN 'open' THEN 3 ELSE 4 END,COALESCE(t.due_at,t.created_at) LIMIT 100`).bind(org).all(),
    db.prepare(`SELECT i.*,c.first_name||' '||c.last_name client_name FROM operations_incidents i LEFT JOIN clients c ON c.id=i.client_id AND c.organisation_id=i.organisation_id WHERE i.organisation_id=? ORDER BY CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 50`).bind(org).all(),
    db.prepare(`SELECT h.*,u.display_name created_by_name FROM shift_handovers h LEFT JOIN users u ON u.id=h.created_by AND u.organisation_id=h.organisation_id WHERE h.organisation_id=? ORDER BY h.created_at DESC LIMIT 20`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name FROM clients WHERE organisation_id=? AND archived_at IS NULL ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT id,first_name,last_name,preferred_name,job_title FROM staff WHERE organisation_id=? AND status='Active' ORDER BY first_name,last_name`).bind(org).all(),
    db.prepare(`SELECT COUNT(*) count FROM care_plans WHERE organisation_id=? AND status='Active' AND date(review_date)<=date('now','+30 day')`).bind(org).first(),
    db.prepare(`SELECT COUNT(*) count FROM risk_assessments WHERE organisation_id=? AND status='Active' AND date(review_date)<=date('now','+30 day')`).bind(org).first()
  ]);
  const taskRows=tasks.results||[], incidentRows=incidents.results||[];
  const now=Date.now(); taskRows.forEach(t=>{if(t.status==='open'&&t.due_at&&new Date(t.due_at).getTime()<now)t.status='overdue'});
  const stats={open:taskRows.filter(x=>x.status==='open').length,overdue:taskRows.filter(x=>x.status==='overdue').length,completed:taskRows.filter(x=>x.status==='completed').length,escalated:taskRows.filter(x=>x.status==='escalated').length,incidentsOpen:incidentRows.filter(x=>x.status!=='closed').length,incidentsHigh:incidentRows.filter(x=>['high','critical'].includes(x.severity)&&x.status!=='closed').length,handoversUnread:(handovers.results||[]).filter(x=>!x.acknowledged_at).length,careDue:careDue?.count||0,riskDue:riskDue?.count||0,activeStaff:(staff.results||[]).length,activeClients:(clients.results||[]).length};
  const timeline=[...taskRows.slice(0,20).map(x=>({type:'task',title:x.title,detail:`${x.status}${x.client_name?' · '+x.client_name:''}`,created_at:x.updated_at||x.created_at})),...incidentRows.slice(0,20).map(x=>({type:'incident',title:x.title,detail:`${x.severity} · ${x.status}`,created_at:x.updated_at||x.created_at})),...(handovers.results||[]).slice(0,10).map(x=>({type:'handover',title:`${x.shift} handover`,detail:x.summary,created_at:x.created_at}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,25);
  return json({stats,tasks:taskRows,incidents:incidentRows,handovers:handovers.results||[],clients:clients.results||[],staff:staff.results||[],timeline});
}
async function createOperationsTask(request,db,session){const i=await readJson(request),title=clean(i.title);if(!title)return json({error:{code:'VALIDATION_ERROR',message:'Enter a task title.'}},400);const id=crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO operations_tasks(id,organisation_id,client_id,assigned_staff_id,title,description,category,priority,status,due_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clean(i.clientId)||null,clean(i.staffId)||null,title,clean(i.description),clean(i.category)||'Care',['low','normal','high','critical'].includes(clean(i.priority))?clean(i.priority):'normal','open',clean(i.dueAt)||null,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'operations.task_created','task',id,{title})]);return json({ok:true,id});}
async function updateOperationsTask(db,session,id,action){const row=await db.prepare('SELECT title FROM operations_tasks WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!row)return notFound('Task');const status=action==='complete'?'completed':'escalated',column=action==='complete'?'completed_at':'escalated_at';await db.batch([db.prepare(`UPDATE operations_tasks SET status=?,${column}=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,`operations.task_${action}`,'task',id,{title:row.title})]);return json({ok:true});}
async function createOperationsIncident(request,db,session){const i=await readJson(request),title=clean(i.title),description=clean(i.description);if(!title||!description)return json({error:{code:'VALIDATION_ERROR',message:'Enter an incident title and description.'}},400);const id=crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO operations_incidents(id,organisation_id,client_id,reported_by,category,severity,title,description,status,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clean(i.clientId)||null,session.user_id,clean(i.category)||'General',['low','medium','high','critical'].includes(clean(i.severity))?clean(i.severity):'medium',title,description,'open',clean(i.occurredAt)||null),auditStatement(db,session.organisation_id,session.user_id,'operations.incident_created','incident',id,{title,severity:i.severity})]);return json({ok:true,id});}
async function reviewOperationsIncident(request,db,session,id){const i=await readJson(request);const row=await db.prepare('SELECT title FROM operations_incidents WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!row)return notFound('Incident');await db.batch([db.prepare(`UPDATE operations_incidents SET status='closed',manager_review=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(i.review)||'Reviewed and closed.',session.user_id,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'operations.incident_reviewed','incident',id,{title:row.title})]);return json({ok:true});}
async function createShiftHandover(request,db,session){const i=await readJson(request),summary=clean(i.summary);if(!summary)return json({error:{code:'VALIDATION_ERROR',message:'Enter a handover summary.'}},400);const id=crypto.randomUUID();await db.batch([db.prepare(`INSERT INTO shift_handovers(id,organisation_id,shift,summary,concerns,outstanding_actions,created_by) VALUES(?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clean(i.shift)||'Day',summary,clean(i.concerns),clean(i.outstandingActions),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'operations.handover_created','handover',id,{shift:i.shift})]);return json({ok:true,id});}
async function acknowledgeShiftHandover(db,session,id){const row=await db.prepare('SELECT shift FROM shift_handovers WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!row)return notFound('Handover');await db.batch([db.prepare('UPDATE shift_handovers SET acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(session.user_id,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'operations.handover_acknowledged','handover',id,{shift:row.shift})]);return json({ok:true});}


async function refreshCareDeliveryAlerts(db, session) {
  const org=session.organisation_id, today=new Date().toISOString().slice(0,10), in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const [plans,risks,clients]=await Promise.all([
    db.prepare("SELECT id,client_id,title,review_date,approval_status,status FROM care_plans WHERE organisation_id=? AND status='Active'").bind(org).all(),
    db.prepare("SELECT id,client_id,title,severity,review_date,status FROM risk_assessments WHERE organisation_id=? AND status='Active'").bind(org).all(),
    db.prepare("SELECT id,first_name,last_name FROM clients WHERE organisation_id=? AND status='Active'").bind(org).all()
  ]);
  const names=Object.fromEntries((clients.results||[]).map(c=>[c.id,`${c.first_name} ${c.last_name}`]));
  const statements=[];
  for(const p of plans.results||[]){
    if(p.approval_status!=='approved') statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,care_plan_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,p.client_id,p.id,'care_plan_approval','warning',`Care plan awaiting approval: ${names[p.client_id]||'Client'}`,p.title,p.review_date));
    if(p.review_date&&p.review_date<=in30) statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,care_plan_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,p.client_id,p.id,'care_plan_review',p.review_date<today?'critical':'warning',`Care plan review ${p.review_date<today?'overdue':'due soon'}: ${names[p.client_id]||'Client'}`,p.title,p.review_date));
    if(p.review_date) statements.push(db.prepare(`INSERT OR IGNORE INTO care_review_schedule(id,organisation_id,client_id,record_type,record_id,due_date) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,p.client_id,'care_plan',p.id,p.review_date));
  }
  for(const r of risks.results||[]){
    if(r.severity==='High') statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,risk_assessment_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,r.client_id,r.id,'high_risk','critical',`High risk: ${names[r.client_id]||'Client'}`,r.title,r.review_date));
    if(r.review_date&&r.review_date<=in30) statements.push(db.prepare(`INSERT OR IGNORE INTO care_delivery_alerts(id,organisation_id,client_id,risk_assessment_id,alert_type,severity,title,message,due_date) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,r.client_id,r.id,'risk_review',r.review_date<today?'critical':'warning',`Risk review ${r.review_date<today?'overdue':'due soon'}: ${names[r.client_id]||'Client'}`,r.title,r.review_date));
    if(r.review_date) statements.push(db.prepare(`INSERT OR IGNORE INTO care_review_schedule(id,organisation_id,client_id,record_type,record_id,due_date) VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),org,r.client_id,'risk',r.id,r.review_date));
  }
  if(statements.length) await db.batch(statements);
}
async function careDeliveryDashboard(db,session){
  await refreshCareDeliveryAlerts(db,session); const org=session.organisation_id,today=new Date().toISOString().slice(0,10);
  const [plans,risks,alerts,reviews,visits]=await Promise.all([
    db.prepare(`SELECT cp.*,c.first_name||' '||c.last_name client_name FROM care_plans cp JOIN clients c ON c.id=cp.client_id WHERE cp.organisation_id=? ORDER BY cp.review_date`).bind(org).all(),
    db.prepare(`SELECT r.*,c.first_name||' '||c.last_name client_name FROM risk_assessments r JOIN clients c ON c.id=r.client_id WHERE r.organisation_id=? AND r.status='Active' ORDER BY CASE r.severity WHEN 'High' THEN 0 ELSE 1 END,r.review_date`).bind(org).all(),
    db.prepare(`SELECT a.*,c.first_name||' '||c.last_name client_name FROM care_delivery_alerts a LEFT JOIN clients c ON c.id=a.client_id WHERE a.organisation_id=? AND a.status='open' ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END,a.due_date LIMIT 50`).bind(org).all(),
    db.prepare(`SELECT * FROM care_review_schedule WHERE organisation_id=? AND status='scheduled' ORDER BY due_date LIMIT 50`).bind(org).all(),
    db.prepare(`SELECT COUNT(*) total,COUNT(CASE WHEN rota_status='draft' THEN 1 END) draft FROM care_visits WHERE organisation_id=? AND date(scheduled_start)>=date('now')`).bind(org).first()
  ]);
  const active=(plans.results||[]).filter(x=>x.status==='Active'), pending=active.filter(x=>x.approval_status!=='approved').length, overdue=active.filter(x=>x.review_date&&x.review_date<today).length, high=(risks.results||[]).filter(x=>x.severity==='High').length;
  return json({metrics:{activePlans:active.length,pendingApproval:pending,overdueReviews:overdue,highRisks:high,openAlerts:(alerts.results||[]).length,futureVisits:Number(visits?.total||0),draftVisits:Number(visits?.draft||0)},alerts:alerts.results||[],reviews:reviews.results||[],plans:(plans.results||[]).map(r=>({...toCarePlan(r),clientName:r.client_name})),risks:risks.results||[]});
}
async function carePlanAction(request,db,session,id,action){
  if(!hasRole(session,['owner','manager','organisation_owner','organisation_admin','branch_manager']))return forbidden();
  const plan=await db.prepare(`SELECT * FROM care_plans WHERE id=? AND organisation_id=?`).bind(id,session.organisation_id).first(); if(!plan)return notFound('Care plan');
  if(action==='approve'){
    await db.batch([db.prepare(`UPDATE care_plans SET status='Active',approval_status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(session.user_id,id,session.organisation_id),db.prepare(`UPDATE client_onboarding_items SET status='completed',completed_at=CURRENT_TIMESTAMP,completed_by=?,updated_at=CURRENT_TIMESTAMP WHERE organisation_id=? AND client_id=? AND item_key='care_plan'`).bind(session.user_id,session.organisation_id,plan.client_id),auditStatement(db,session.organisation_id,session.user_id,'care_plan.approved','care_plan',id,{clientId:plan.client_id})]);
    return json({ok:true,status:'approved'});
  }
  if(plan.approval_status!=='approved')return json({error:{code:'APPROVAL_REQUIRED',message:'Approve the care plan before generating visits.'}},409);
  const reqs=await db.prepare(`SELECT * FROM client_visit_requirements WHERE organisation_id=? AND client_id=? AND status='active'`).bind(session.organisation_id,plan.client_id).all();
  if(!(reqs.results||[]).length)return json({error:{code:'NO_VISIT_REQUIREMENTS',message:'Add visit requirements to the client before generating visits.'}},409);
  const statements=[];let count=0;
  for(const r of reqs.results||[]){const requirement={visitType:r.visit_type,days:JSON.parse(r.days_json||'[]'),preferredTime:r.preferred_time,windowMinutes:r.window_minutes,durationMinutes:r.duration_minutes,carersRequired:r.carers_required,notes:r.notes,startDate:r.start_date,endDate:r.end_date};for(const date of generatedDates(requirement)){const day=date.toISOString().slice(0,10),start=new Date(`${day}T${requirement.preferredTime}:00`),end=new Date(start.getTime()+requirement.durationMinutes*60000);statements.push(db.prepare(`INSERT OR IGNORE INTO care_visits(id,organisation_id,client_id,staff_id,visit_type,scheduled_start,scheduled_end,status,rota_source,rota_status,recurrence_group_id,recurrence_pattern,requirement_id,requirement_occurrence_date,created_by,protected_time_rule,protected_time_reason,protected_window_minutes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,plan.client_id,null,requirement.visitType,start.toISOString(),end.toISOString(),'scheduled','care_plan','draft',r.id,'requirement',r.id,day,session.user_id,r.scheduling_rule||'flexible',r.time_critical_reason||'',Number(r.window_minutes)||0));count++;}}
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
    WHERE v.organisation_id=? AND v.staff_id=?`;
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
  const [clients, staff, plans, risks, auditRows] = await Promise.all([
    db.prepare("SELECT status,risk,next_review FROM clients WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare("SELECT status,dbs_expiry,training_expiry FROM staff WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare("SELECT status,review_date FROM care_plans WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare("SELECT status,severity,review_date FROM risk_assessments WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare(`SELECT a.action,a.entity_type,a.created_at,u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT 6`).bind(session.organisation_id).all()
  ]);
  const today = new Date().toISOString().slice(0,10);
  const in30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const activeClients = clients.results.filter(x => x.status === "Active").length;
  const reviewsDue = clients.results.filter(x => x.status === "Active" && x.next_review && x.next_review < today).length;
  const highRisk = clients.results.filter(x => x.status === "Active" && x.risk === "High").length;
  const activeStaff = staff.results.filter(x => x.status === "Active").length;
  const complianceDue = staff.results.filter(x => x.status === "Active" && ((x.dbs_expiry && x.dbs_expiry < today) || (x.training_expiry && x.training_expiry < today))).length;
  const carePlansDue = plans.results.filter(x => x.status === "Active" && x.review_date && x.review_date <= in30).length;
  const activeRisks = risks.results.filter(x => x.status === "Active" && x.severity === "High").length;
  return json({ metrics: { activeClients, reviewsDue, highRisk, activeStaff, totalStaff: staff.results.length, complianceDue, carePlansDue, activeRisks }, activity: auditRows.results });
}

const STAFF_COLUMNS = `s.id,s.first_name,s.last_name,s.preferred_name,s.job_title,s.employment_type,s.phone,s.email,s.start_date,s.status,s.dbs_expiry,s.training_expiry,s.notes,s.created_at,s.updated_at,
  u.id AS login_user_id,u.email AS login_email,u.access_level AS login_access_level,u.status AS login_status,u.must_change_password,u.last_login_at`;
async function listStaff(db, session, url) {
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const result = await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.organisation_id=? ${branchRestricted(session)?"AND s.branch_id=?":""} ${includeInactive ? "" : "AND s.status='Active'"} ORDER BY s.last_name COLLATE NOCASE,s.first_name COLLATE NOCASE`).bind(session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).all();
  return json({ staff: result.results.map(toStaff) });
}
async function createStaff(request, db, session) {
  if (!hasRole(session,["owner","manager"])) return forbidden();
  const input = await readJson(request); const v = validateStaff(input); if (v.error) return json({error:{code:"VALIDATION_ERROR",message:v.error}},400);
  const createLogin = input.createLogin === true || clean(input.createLogin)==='on' || clean(input.createLogin)==='true';
  const loginEmail = clean(input.loginEmail || input.email).toLowerCase();
  const accessLevel = clean(input.loginAccessLevel)||'carer';
  const temporaryPassword = String(input.temporaryPassword||'');
  if(createLogin && (!loginEmail || !allowedAccessLevels().includes(accessLevel) || temporaryPassword.length<12)) return json({error:{code:'VALIDATION_ERROR',message:'Enter a login email, valid access level and temporary password of at least 12 characters.'}},400);
  const id=crypto.randomUUID(), statements=[];
  statements.push(db.prepare(`INSERT INTO staff (id,organisation_id,branch_id,first_name,last_name,preferred_name,job_title,employment_type,phone,email,start_date,status,dbs_expiry,training_expiry,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,activeBranch(session),...v.values));
  if(createLogin){
    const secured=await hashPassword(temporaryPassword), userId=crypto.randomUUID(), displayName=`${v.values[0]} ${v.values[1]}`.trim();
    statements.push(db.prepare(`INSERT INTO users (id,organisation_id,staff_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',1)`).bind(userId,session.organisation_id,id,loginEmail,displayName,legacyRole(accessLevel),accessLevel,activeBranch(session),secured.hash,secured.salt,PASSWORD_ITERATIONS));
    statements.push(auditStatement(db,session.organisation_id,session.user_id,'staff.login_created','user',userId,{staffId:id,email:loginEmail,accessLevel}));
  }
  statements.push(auditStatement(db,session.organisation_id,session.user_id,"staff.created","staff",id,{name:`${v.values[0]} ${v.values[1]}`,loginCreated:createLogin}));
  try{await db.batch(statements);}catch(error){if(String(error).includes('UNIQUE'))return json({error:{code:'LOGIN_EXISTS',message:'That login email is already in use, or this staff member already has a login.'}},409);throw error;}
  const row=await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.id=? AND s.organisation_id=?`).bind(id,session.organisation_id).first(); return json({staff:toStaff(row)},201);
}
async function updateStaff(request, db, session, id) {
  if (!hasRole(session,["owner","manager"])) return forbidden();
  const input=await readJson(request); const v=validateStaff(input); if(v.error) return json({error:{code:"VALIDATION_ERROR",message:v.error}},400);
  const existing=await db.prepare(`SELECT s.id,u.id login_user_id FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.id=? AND s.organisation_id=?`).bind(id,session.organisation_id).first();
  if(!existing)return json({error:{code:'STAFF_NOT_FOUND',message:'Staff record not found.'}},404);
  const statements=[db.prepare(`UPDATE staff SET first_name=?,last_name=?,preferred_name=?,job_title=?,employment_type=?,phone=?,email=?,start_date=?,status=?,dbs_expiry=?,training_expiry=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(...v.values,id,session.organisation_id)];
  const createLogin=input.createLogin===true||clean(input.createLogin)==='on'||clean(input.createLogin)==='true';
  if(createLogin&&!existing.login_user_id){
    const loginEmail=clean(input.loginEmail||input.email).toLowerCase(),accessLevel=clean(input.loginAccessLevel)||'carer',temporaryPassword=String(input.temporaryPassword||'');
    if(!loginEmail||!allowedAccessLevels().includes(accessLevel)||temporaryPassword.length<12)return json({error:{code:'VALIDATION_ERROR',message:'Enter a login email, valid access level and temporary password of at least 12 characters.'}},400);
    const secured=await hashPassword(temporaryPassword),userId=crypto.randomUUID(),displayName=`${v.values[0]} ${v.values[1]}`.trim();
    statements.push(db.prepare(`INSERT INTO users (id,organisation_id,staff_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',1)`).bind(userId,session.organisation_id,id,loginEmail,displayName,legacyRole(accessLevel),accessLevel,activeBranch(session),secured.hash,secured.salt,PASSWORD_ITERATIONS));
    statements.push(auditStatement(db,session.organisation_id,session.user_id,'staff.login_created','user',userId,{staffId:id,email:loginEmail,accessLevel}));
  } else if(existing.login_user_id){
    const loginStatus=v.values[8]==='Inactive'?'disabled':(clean(input.loginStatus)||'active');
    const accessLevel=allowedAccessLevels().includes(clean(input.loginAccessLevel))?clean(input.loginAccessLevel):null;
    if(accessLevel) statements.push(db.prepare(`UPDATE users SET display_name=?,role=?,access_level=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(`${v.values[0]} ${v.values[1]}`.trim(),legacyRole(accessLevel),accessLevel,loginStatus,existing.login_user_id,session.organisation_id));
    else statements.push(db.prepare(`UPDATE users SET display_name=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(`${v.values[0]} ${v.values[1]}`.trim(),loginStatus,existing.login_user_id,session.organisation_id));
    if(loginStatus==='disabled')statements.push(db.prepare('DELETE FROM sessions WHERE user_id=?').bind(existing.login_user_id));
  }
  statements.push(auditStatement(db,session.organisation_id,session.user_id,"staff.updated","staff",id,{status:v.values[8]}));
  try{await db.batch(statements);}catch(error){if(String(error).includes('UNIQUE'))return json({error:{code:'LOGIN_EXISTS',message:'That login email is already in use, or this staff member already has a login.'}},409);throw error;}
  const row=await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff s LEFT JOIN users u ON u.organisation_id=s.organisation_id AND u.staff_id=s.id WHERE s.id=? AND s.organisation_id=?`).bind(id,session.organisation_id).first(); return json({staff:toStaff(row)});
}
function validateStaff(input){
  const values=[clean(input.firstName),clean(input.lastName),clean(input.preferredName),clean(input.jobTitle)||"Carer",clean(input.employmentType)||"Employee",clean(input.phone),clean(input.email),clean(input.startDate),clean(input.status)||"Active",clean(input.dbsExpiry),clean(input.trainingExpiry),clean(input.notes)];
  if(!values[0]||!values[1]) return {error:"Enter the staff member's first and last name."};
  if(!["Active","Inactive"].includes(values[8])) return {error:"Choose a valid staff status."};
  return {values};
}
function toStaff(row){return {id:row.id,firstName:row.first_name,lastName:row.last_name,preferredName:row.preferred_name||"",jobTitle:row.job_title,employmentType:row.employment_type,phone:row.phone||"",email:row.email||"",startDate:row.start_date||"",status:row.status,dbsExpiry:row.dbs_expiry||"",trainingExpiry:row.training_expiry||"",notes:row.notes||"",loginUserId:row.login_user_id||"",loginEmail:row.login_email||"",loginAccessLevel:row.login_access_level||"carer",loginStatus:row.login_status||"",mustChangePassword:Boolean(row.must_change_password),lastLoginAt:row.last_login_at||"",createdAt:row.created_at,updatedAt:row.updated_at};}


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
  if(!await ensureClient(db,session,clientId)) return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);
  const r=await db.prepare("SELECT * FROM care_plans WHERE organisation_id=? AND client_id=? ORDER BY CASE status WHEN 'Active' THEN 0 WHEN 'Under review' THEN 1 WHEN 'Draft' THEN 2 ELSE 3 END, review_date").bind(session.organisation_id,clientId).all();
  const sections=await carePlanSections(db,session.organisation_id,(r.results||[]).map(x=>x.id));
  return json({carePlans:r.results.map(row=>({...toCarePlan(row),sections:sections[row.id]||[]}))});
}

async function listAllCarePlans(db, session, url){
  const status=clean(url.searchParams.get("status"));
  const params=[session.organisation_id]; let where="cp.organisation_id=?";
  if(status && ["Draft","Active","Under review","Archived"].includes(status)){where+=" AND cp.status=?";params.push(status);}
  const result=await db.prepare(`SELECT cp.*, c.first_name, c.last_name, c.preferred_name FROM care_plans cp JOIN clients c ON c.id=cp.client_id AND c.organisation_id=cp.organisation_id WHERE ${where} ORDER BY CASE cp.status WHEN 'Active' THEN 0 WHEN 'Under review' THEN 1 WHEN 'Draft' THEN 2 ELSE 3 END,cp.review_date,c.last_name COLLATE NOCASE,c.first_name COLLATE NOCASE`).bind(...params).all();
  const sections=await carePlanSections(db,session.organisation_id,(result.results||[]).map(x=>x.id));
  return json({carePlans:result.results.map(row=>({...toCarePlan(row),sections:sections[row.id]||[],clientName:[row.preferred_name||row.first_name,row.last_name].filter(Boolean).join(" ")}))});
}
async function createCarePlan(request,db,session,clientId){
  if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager","office_staff","senior_carer"])) return forbidden();
  if(!await ensureClient(db,session,clientId)) return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);
  const parsed=carePlanInput(await readJson(request)); if(parsed.error)return json({error:{code:"VALIDATION_ERROR",message:parsed.error}},400); const v=parsed.v,id=crypto.randomUUID();
  const statements=[db.prepare(`INSERT INTO care_plans (id,organisation_id,branch_id,client_id,title,status,effective_date,review_date,author_name,plan_type,plan_summary,what_matters,preferences,consent_status,capacity_status,decision_maker,review_notes,approval_status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`).bind(id,session.organisation_id,activeBranch(session),clientId,v.title,v.status==='Active'?'Draft':v.status,v.effectiveDate||null,v.reviewDate,v.authorName,v.planType||'Comprehensive care plan',v.planSummary,v.whatMatters,v.preferences,v.consentStatus,v.capacityStatus,v.decisionMaker,v.reviewNotes,session.user_id),...sectionStatements(db,session,id,v.sections),auditStatement(db,session.organisation_id,session.user_id,"care_plan.created","care_plan",id,{clientId,title:v.title,status:'Draft',sections:v.sections.length})];
  await db.batch(statements); const row=await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first(); return json({carePlan:{...toCarePlan(row),sections:v.sections}},201);
}
async function updateCarePlan(request,db,session,id){
  if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager","office_staff","senior_carer"])) return forbidden();
  const existing=await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first(); if(!existing)return json({error:{code:"NOT_FOUND",message:"Care plan not found."}},404);
  const parsed=carePlanInput(await readJson(request)); if(parsed.error)return json({error:{code:"VALIDATION_ERROR",message:parsed.error}},400); const v=parsed.v,next=Number(existing.version||1)+1;
  const oldSections=await carePlanSections(db,session.organisation_id,[id]); const snapshot={...toCarePlan(existing),sections:oldSections[id]||[]};
  const statements=[db.prepare("INSERT INTO care_plan_versions (id,organisation_id,care_plan_id,version,snapshot_json,created_by) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),session.organisation_id,id,existing.version||1,JSON.stringify(snapshot),session.user_id),db.prepare(`UPDATE care_plans SET title=?,status=?,version=?,effective_date=?,review_date=?,author_name=?,plan_type=?,plan_summary=?,what_matters=?,preferences=?,consent_status=?,capacity_status=?,decision_maker=?,review_notes=?,approval_status='pending',approved_by=NULL,approved_at=NULL,submitted_by=?,submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(v.title,v.status==='Active'?'Under review':v.status,next,v.effectiveDate||null,v.reviewDate,v.authorName,v.planType||'Comprehensive care plan',v.planSummary,v.whatMatters,v.preferences,v.consentStatus,v.capacityStatus,v.decisionMaker,v.reviewNotes,session.user_id,id,session.organisation_id),...sectionStatements(db,session,id,v.sections),auditStatement(db,session.organisation_id,session.user_id,"care_plan.updated","care_plan",id,{version:next,status:v.status,sections:v.sections.length})];
  await db.batch(statements); return json({carePlan:{...toCarePlan(await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first()),sections:v.sections}});
}
async function archiveCarePlan(db,session,id){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const r=await db.prepare("UPDATE care_plans SET status='Archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Care plan not found."}},404);await audit(db,session.organisation_id,session.user_id,"care_plan.archived","care_plan",id,{});return json({ok:true});}
function toCarePlan(r){return {id:r.id,clientId:r.client_id,title:r.title,status:r.status,version:r.version,effectiveDate:r.effective_date||"",reviewDate:r.review_date,authorName:r.author_name||"",planType:r.plan_type||"Comprehensive care plan",planSummary:r.plan_summary||"",whatMatters:r.what_matters||r.personal_details||"",preferences:r.preferences||"",consentStatus:r.consent_status||"Not recorded",capacityStatus:r.capacity_status||"Not assessed",decisionMaker:r.decision_maker||"",reviewNotes:r.review_notes||"",personalDetails:r.personal_details||"",medicalConditions:r.medical_conditions||"",communication:r.communication||"",mobility:r.mobility||"",nutritionHydration:r.nutrition_hydration||"",medicationSupport:r.medication_support||"",continence:r.continence||"",skinIntegrity:r.skin_integrity||"",mentalCapacity:r.mental_capacity||"",risks:r.risks||"",desiredOutcomes:r.desired_outcomes||"",approvalStatus:r.approval_status||"pending",approvedAt:r.approved_at||"",submittedAt:r.submitted_at||"",visitGenerationStatus:r.visit_generation_status||"not_generated",visitsGeneratedAt:r.visits_generated_at||"",createdAt:r.created_at,updatedAt:r.updated_at};}

function riskInput(input){const v={category:clean(input.category)||"General Risk",title:clean(input.title),severity:clean(input.severity)||"Medium",likelihood:clean(input.likelihood)||"Possible",controls:clean(input.controls),actions:clean(input.actions),status:clean(input.status)||"Active",reviewDate:clean(input.reviewDate)};if(!v.title||!v.reviewDate)return {error:"Enter a risk title and review date."};return {v};}
async function listRisks(db,session,clientId){if(!await ensureClient(db,session,clientId))return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);const r=await db.prepare("SELECT * FROM risk_assessments WHERE organisation_id=? AND client_id=? ORDER BY CASE severity WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, review_date").bind(session.organisation_id,clientId).all();return json({risks:r.results.map(toRisk)});}
async function createRisk(request,db,session,clientId){if(!hasRole(session,["owner","manager","carer"]))return forbidden();const p=riskInput(await readJson(request));if(p.error)return json({error:{code:"VALIDATION_ERROR",message:p.error}},400);const v=p.v,id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO risk_assessments (id,organisation_id,branch_id,client_id,category,title,severity,likelihood,controls,actions,status,review_date,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,activeBranch(session),clientId,v.category,v.title,v.severity,v.likelihood,v.controls,v.actions,v.status,v.reviewDate,session.user_id),auditStatement(db,session.organisation_id,session.user_id,"risk.created","risk",id,{clientId,title:v.title,severity:v.severity})]);return json({risk:toRisk(await db.prepare("SELECT * FROM risk_assessments WHERE id=?").bind(id).first())},201);}
async function updateRisk(request,db,session,id){if(!hasRole(session,["owner","manager","carer"]))return forbidden();const p=riskInput(await readJson(request));if(p.error)return json({error:{code:"VALIDATION_ERROR",message:p.error}},400);const v=p.v,r=await db.prepare("UPDATE risk_assessments SET category=?,title=?,severity=?,likelihood=?,controls=?,actions=?,status=?,review_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(v.category,v.title,v.severity,v.likelihood,v.controls,v.actions,v.status,v.reviewDate,id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Risk assessment not found."}},404);await audit(db,session.organisation_id,session.user_id,"risk.updated","risk",id,{severity:v.severity,status:v.status});return json({risk:toRisk(await db.prepare("SELECT * FROM risk_assessments WHERE id=?").bind(id).first())});}
function toRisk(r){return {id:r.id,clientId:r.client_id,category:r.category,title:r.title,severity:r.severity,likelihood:r.likelihood,controls:r.controls||"",actions:r.actions||"",status:r.status,reviewDate:r.review_date,createdAt:r.created_at,updatedAt:r.updated_at};}

function documentInput(input){const v={name:clean(input.name),documentType:clean(input.documentType)||"Other",documentDate:clean(input.documentDate),reviewDate:clean(input.reviewDate),referenceUrl:clean(input.referenceUrl),notes:clean(input.notes),status:clean(input.status)||"Current"};if(!v.name)return {error:"Enter a document name."};return {v};}
async function listDocuments(db,session,clientId){if(!await ensureClient(db,session,clientId))return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);const r=await db.prepare("SELECT * FROM client_documents WHERE organisation_id=? AND client_id=? ORDER BY created_at DESC").bind(session.organisation_id,clientId).all();return json({documents:r.results.map(toDocument)});}
async function createDocument(request,db,session,clientId){if(!hasRole(session,["owner","manager","carer"]))return forbidden();const p=documentInput(await readJson(request));if(p.error)return json({error:{code:"VALIDATION_ERROR",message:p.error}},400);const v=p.v,id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO client_documents (id,organisation_id,branch_id,client_id,name,document_type,document_date,review_date,reference_url,notes,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,activeBranch(session),clientId,v.name,v.documentType,v.documentDate||null,v.reviewDate||null,v.referenceUrl,v.notes,v.status,session.user_id),auditStatement(db,session.organisation_id,session.user_id,"document.added","document",id,{clientId,name:v.name,type:v.documentType})]);return json({document:toDocument(await db.prepare("SELECT * FROM client_documents WHERE id=?").bind(id).first())},201);}
async function archiveDocument(db,session,id){if(!hasRole(session,["owner","manager"]))return forbidden();const r=await db.prepare("UPDATE client_documents SET status='Archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Document not found."}},404);await audit(db,session.organisation_id,session.user_id,"document.archived","document",id,{});return json({ok:true});}
function toDocument(r){return {id:r.id,clientId:r.client_id,name:r.name,documentType:r.document_type,documentDate:r.document_date||"",reviewDate:r.review_date||"",referenceUrl:r.reference_url||"",notes:r.notes||"",status:r.status,createdAt:r.created_at};}

async function listUsers(db, session) {
  if (!hasRole(session, ["owner", "manager", "auditor"])) return forbidden();
  const result = await db.prepare("SELECT u.id,u.email,u.display_name,u.role,u.access_level,u.home_branch_id,u.status,u.must_change_password,u.last_login_at,u.created_at,ucr.role_id AS custom_role_id,cr.name AS custom_role_name FROM users u LEFT JOIN user_custom_roles ucr ON ucr.user_id=u.id AND ucr.organisation_id=u.organisation_id LEFT JOIN custom_roles cr ON cr.id=ucr.role_id WHERE u.organisation_id=? ORDER BY u.display_name COLLATE NOCASE").bind(session.organisation_id).all();
  return json({ users: result.results.map(toUser) });
}

async function createUser(request, db, session) {
  if (!await userHasPermission(db, session, "security.users.manage")) return forbidden();
  const input = await readJson(request);
  const email = clean(input.email).toLowerCase();
  const name = clean(input.displayName);
  const accessLevel = clean(input.accessLevel || input.role);
  const role = legacyRole(accessLevel);
  const branchId = clean(input.branchId) || null;
  const customRoleId = clean(input.customRoleId) || null;
  const password = String(input.temporaryPassword || "");
  if (!email || !name || !allowedAccessLevels().includes(accessLevel) || password.length < 12) return json({ error: { code: "VALIDATION_ERROR", message: "Enter a name, valid email, role and temporary password of at least 12 characters." } }, 400);
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
  return json({ user: { id, email, displayName: name, role, accessLevel, branchId, status: "active", mustChangePassword: true } }, 201);
}

async function updateUser(request, db, session, id) {
  if (!await userHasPermission(db, session, "security.users.manage")) return forbidden();
  if (id === session.user_id) return json({ error: { code: "SELF_EDIT_BLOCKED", message: "Use the password and profile controls for your own account." } }, 400);
  const input = await readJson(request);
  const name = clean(input.displayName);
  const accessLevel = clean(input.accessLevel || input.role);
  const role = legacyRole(accessLevel);
  const branchId = clean(input.branchId) || null;
  const status = clean(input.status);
  const customRoleId = clean(input.customRoleId) || null;
  if (!name || !allowedAccessLevels().includes(accessLevel) || !["active", "disabled"].includes(status)) return json({ error: { code: "VALIDATION_ERROR", message: "Enter a name, valid access level and status." } }, 400);
  const statements = [db.prepare("UPDATE users SET display_name=?,role=?,access_level=?,home_branch_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name, role, accessLevel, branchId, status, id, session.organisation_id), db.prepare("DELETE FROM user_custom_roles WHERE user_id=? AND organisation_id=?").bind(id,session.organisation_id)];
  if(customRoleId) statements.push(db.prepare("INSERT INTO user_custom_roles(user_id,role_id,organisation_id,branch_id,assigned_by) SELECT ?,id,?,?,? FROM custom_roles WHERE id=? AND organisation_id=? AND is_active=1").bind(id,session.organisation_id,branchId,session.user_id,customRoleId,session.organisation_id));
  statements.push(auditStatement(db, session.organisation_id, session.user_id, "user.updated", "user", id, { role, accessLevel, branchId, customRoleId, status }));
  await db.batch(statements);
  if (status === "disabled") await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  return json({ ok: true });
}

async function updateOrganisation(request, db, session) {
  if (!hasRole(session, ["owner"])) return forbidden();
  const input = await readJson(request), name = clean(input.name);
  if (name.length < 2) return json({ error: { code: "VALIDATION_ERROR", message: "Enter an organisation name." } }, 400);
  await db.batch([
    db.prepare("UPDATE organisations SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name, session.organisation_id),
    auditStatement(db, session.organisation_id, session.user_id, "organisation.updated", "organisation", session.organisation_id, { name })
  ]);
  return json({ organisation: { id: session.organisation_id, name } });
}

async function listAudit(db, session, url) {
  if (!hasRole(session, ["owner", "manager", "auditor"])) return forbidden();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const result = await db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail_json,a.created_at,u.display_name AS user_name,u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id AND u.organisation_id=a.organisation_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(session.organisation_id, limit).all();
  return json({ events: result.results });
}

function developmentStatus(env, session) {
  return json({ database: { connected: Boolean(env.DB), binding: "DB" }, authentication: { mode: "D1 sessions", cookie: SESSION_COOKIE }, user: publicUser(session), organisation: { id: session.organisation_id, name: session.organisation_name }, deployment: { version: VERSION, checkedAt: new Date().toISOString() } });
}

function allowedRoles() { return ["owner", "manager", "carer", "auditor"]; }
function allowedAccessLevels(){return ["organisation_owner","organisation_admin","branch_manager","senior_carer","carer","office_staff","auditor","family"]; }
function legacyRole(level){return ({organisation_owner:"owner",organisation_admin:"owner",branch_manager:"manager",senior_carer:"carer",carer:"carer",office_staff:"manager",auditor:"auditor",family:"auditor"})[level]||"auditor";}
function hasRole(session, roles) { if (session.is_platform_user) return true; return roles.includes(session.role) || roles.includes(session.access_level); }
function requireManagementWorkspace(session) {
  if (session.is_platform_user) return null;
  const allowed = ['organisation_owner','organisation_admin','branch_manager','office_staff','auditor','owner','manager'];
  return allowed.includes(session.access_level) || allowed.includes(session.role) ? null : forbidden();
}
function forbidden() { return json({ error: { code: "FORBIDDEN", message: "Your account does not have permission to perform this action." } }, 403); }
async function permitted(db, session, permission, action) {
  if (!await userHasPermission(db, session, permission)) return forbidden();
  return action();
}
function unauthorised() { return json({ error: { code: "UNAUTHORISED", message: "Sign in to continue." } }, 401, { "set-cookie": expiredSessionCookie() }); }
function databaseRequired(message = "The D1 database binding named DB is not configured.") { return json({ error: { code: "DATABASE_NOT_CONFIGURED", message } }, 503); }
function methodNotAllowed(allow) { return json({ error: { code: "METHOD_NOT_ALLOWED", message: "This method is not allowed." } }, 405, { allow: allow.join(", ") }); }
function publicUser(row) { return { id: row.user_id || row.id, staffId: row.staff_id || null, organisationId: row.organisation_id, organisationName: row.organisation_name, branchId: row.active_branch_id || row.home_branch_id || null, branchName: row.branch_name || null, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, isPlatformUser: Boolean(row.is_platform_user), supportMode: Boolean(row.support_mode), supportOriginOrganisationId: row.support_origin_organisation_id || null, supportStartedAt: row.support_started_at || null, supportReason: row.support_reason || null, supportAccessMode: row.support_access_mode || null, mustChangePassword: Boolean(row.must_change_password) }; }
function toUser(row) { return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, branchId: row.home_branch_id || null, customRoleId: row.custom_role_id || null, customRoleName: row.custom_role_name || null, status: row.status, mustChangePassword: Boolean(row.must_change_password), lastLoginAt: row.last_login_at, createdAt: row.created_at }; }
function clean(value) { return String(value ?? "").trim(); }
async function readJson(request) { try { return await request.json(); } catch { return {}; } }
async function audit(db, organisationId, userId, action, entityType, entityId, detail) { await auditStatement(db, organisationId, userId, action, entityType, entityId, detail).run(); }
function auditStatement(db, organisationId, userId, action, entityType, entityId, detail) { return db.prepare("INSERT INTO audit_log (id,organisation_id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(), organisationId, userId || null, action, entityType, entityId || null, JSON.stringify(detail || {})); }
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




async function ensureOrganisationClient(db,session,clientId){return db.prepare("SELECT id,first_name,last_name FROM clients WHERE id=? AND organisation_id=? AND status<>'Archived'").bind(clientId,session.organisation_id).first();}
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
  const i=await readJson(request),clientId=clean(i.clientId),name=clean(i.name),dose=clean(i.dose); if(!clientId||!name||!dose)return json({error:{code:'VALIDATION_ERROR',message:'Client, medication name and dose are required.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404);
  const id=clean(i.id)||crypto.randomUUID(),times=Array.isArray(i.scheduledTimes)?i.scheduledTimes.map(clean).filter(Boolean):clean(i.scheduledTimes).split(',').map(x=>x.trim()).filter(Boolean);
  const status=clean(i.status)||'active',discontinued=status==='discontinued';
  await db.prepare(`INSERT INTO medications(id,organisation_id,client_id,name,strength,form,route,dose,instructions,frequency,scheduled_times_json,start_date,end_date,is_prn,prn_protocol,min_interval_minutes,max_dose_24h,stock_quantity,stock_unit,low_stock_threshold,status,discontinued_reason,discontinued_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,strength=excluded.strength,form=excluded.form,route=excluded.route,dose=excluded.dose,instructions=excluded.instructions,frequency=excluded.frequency,scheduled_times_json=excluded.scheduled_times_json,start_date=excluded.start_date,end_date=excluded.end_date,is_prn=excluded.is_prn,prn_protocol=excluded.prn_protocol,min_interval_minutes=excluded.min_interval_minutes,max_dose_24h=excluded.max_dose_24h,stock_quantity=excluded.stock_quantity,stock_unit=excluded.stock_unit,low_stock_threshold=excluded.low_stock_threshold,status=excluded.status,discontinued_reason=excluded.discontinued_reason,discontinued_at=excluded.discontinued_at,updated_at=CURRENT_TIMESTAMP`).bind(id,session.organisation_id,clientId,name,clean(i.strength),clean(i.form),clean(i.route),dose,clean(i.instructions),clean(i.frequency),JSON.stringify(times),clean(i.startDate)||null,clean(i.endDate)||null,i.isPrn?1:0,clean(i.prnProtocol),nullableNumber(i.minIntervalMinutes),clean(i.maxDose24h),nullableNumber(i.stockQuantity),clean(i.stockUnit),nullableNumber(i.lowStockThreshold)??5,status,discontinued?clean(i.discontinuedReason):null,discontinued?new Date().toISOString():null,session.user_id).run();
  await audit(db,session.organisation_id,session.user_id,'medication.saved','medication',id,{clientId,name,status}); return json({ok:true,id},201);
}
function localDateString(value){const d=value?new Date(value):new Date();return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
async function administerMedication(request,db,session,id){
  const med=await db.prepare('SELECT * FROM medications WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first(); if(!med)return json({error:{code:'NOT_FOUND',message:'Medication not found.'}},404);
  const i=await readJson(request),outcome=clean(i.outcome); if(!outcome)return json({error:{code:'VALIDATION_ERROR',message:'Choose an administration outcome.'}},400);
  const allowed=['administered','prompted','refused','omitted','unavailable','hospitalised','asleep','missed']; if(!allowed.includes(outcome))return json({error:{code:'VALIDATION_ERROR',message:'Invalid administration outcome.'}},400);
  if(med.is_prn&&outcome==='administered'&&!clean(i.prnReason||i.reason))return json({error:{code:'VALIDATION_ERROR',message:'Record why the PRN medication was required.'}},400);
  const stockUsed=Math.max(0,Number(i.stockUsed)||0),stockChange=outcome==='administered'?-stockUsed:0,adminId=crypto.randomUUID(),administeredAt=clean(i.administeredAt)||new Date().toISOString(),scheduledAt=clean(i.scheduledAt)||null;
  const balance=med.stock_quantity===null?null:Math.max(0,Number(med.stock_quantity)+stockChange);
  const statements=[
    db.prepare(`INSERT INTO medication_administrations(id,organisation_id,medication_id,client_id,visit_id,scheduled_at,scheduled_date,administered_at,outcome,dose_given,reason,notes,stock_change,prn_reason,prn_effectiveness,effectiveness_reviewed_at,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(adminId,session.organisation_id,id,med.client_id,clean(i.visitId)||null,scheduledAt,scheduledAt?localDateString(scheduledAt):localDateString(administeredAt),administeredAt,outcome,clean(i.doseGiven)||med.dose,clean(i.reason),clean(i.notes),stockChange,clean(i.prnReason),clean(i.prnEffectiveness),clean(i.prnEffectiveness)?new Date().toISOString():null,session.user_id),
    db.prepare(`UPDATE medications SET stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL ELSE MAX(0,stock_quantity+?) END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(stockChange,id,session.organisation_id),
    auditStatement(db,session.organisation_id,session.user_id,'medication.administered','medication_administration',adminId,{medicationId:id,outcome,clientId:med.client_id,scheduledAt})
  ];
  if(stockChange)statements.push(db.prepare(`INSERT INTO medication_stock_transactions(id,organisation_id,medication_id,client_id,transaction_type,quantity,balance_after,reason,administration_id,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,id,med.client_id,'administration',stockChange,balance,`eMAR: ${outcome}`,adminId,session.user_id));
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
  const current=Number(med.stock_quantity)||0,balance=Math.max(0,current+quantity),tid=crypto.randomUUID();
  await db.batch([db.prepare('UPDATE medications SET stock_quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(balance,id,session.organisation_id),db.prepare(`INSERT INTO medication_stock_transactions(id,organisation_id,medication_id,client_id,transaction_type,quantity,balance_after,reason,recorded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(tid,session.organisation_id,id,med.client_id,type,quantity,balance,reason,session.user_id),auditStatement(db,session.organisation_id,session.user_id,'medication.stock_adjusted','medication',id,{quantity,balance,reason,type})]);return json({ok:true,balance},201);
}
async function correctMedicationAdministration(request,db,session,id){
  const original=await db.prepare(`SELECT a.*,m.stock_quantity,m.client_id AS med_client_id FROM medication_administrations a JOIN medications m ON m.id=a.medication_id AND m.organisation_id=a.organisation_id WHERE a.id=? AND a.organisation_id=?`).bind(id,session.organisation_id).first();if(!original)return json({error:{code:'NOT_FOUND',message:'MAR entry not found.'}},404);if(original.is_void)return json({error:{code:'VALIDATION_ERROR',message:'This MAR entry has already been corrected.'}},400);
  const i=await readJson(request),reason=clean(i.correctionReason);if(!reason)return json({error:{code:'VALIDATION_ERROR',message:'Enter the reason for correction.'}},400);
  const replacementId=crypto.randomUUID(),outcome=clean(i.outcome)||original.outcome,stockUsed=Math.max(0,Number(i.stockUsed)||0),newChange=outcome==='administered'?-stockUsed:0,stockDelta=-Number(original.stock_change||0)+newChange,balance=original.stock_quantity===null?null:Math.max(0,Number(original.stock_quantity)+stockDelta);
  const statements=[db.prepare('UPDATE medication_administrations SET is_void=1,correction_reason=? WHERE id=? AND organisation_id=?').bind(reason,id,session.organisation_id),db.prepare(`INSERT INTO medication_administrations(id,organisation_id,medication_id,client_id,visit_id,scheduled_at,scheduled_date,administered_at,outcome,dose_given,reason,notes,stock_change,prn_reason,prn_effectiveness,effectiveness_reviewed_at,corrected_from_id,correction_reason,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(replacementId,session.organisation_id,original.medication_id,original.client_id,original.visit_id,original.scheduled_at,original.scheduled_date,clean(i.administeredAt)||new Date().toISOString(),outcome,clean(i.doseGiven)||original.dose_given,clean(i.reason),clean(i.notes),newChange,clean(i.prnReason),clean(i.prnEffectiveness),clean(i.prnEffectiveness)?new Date().toISOString():null,id,reason,session.user_id),db.prepare('UPDATE medications SET stock_quantity=CASE WHEN stock_quantity IS NULL THEN NULL ELSE ? END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(balance,original.medication_id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'medication.administration_corrected','medication_administration',replacementId,{originalId:id,reason,outcome})];
  if(stockDelta)statements.push(db.prepare(`INSERT INTO medication_stock_transactions(id,organisation_id,medication_id,client_id,transaction_type,quantity,balance_after,reason,administration_id,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.organisation_id,original.medication_id,original.client_id,'correction',stockDelta,balance,reason,replacementId,session.user_id));
  await db.batch(statements);return json({ok:true,id:replacementId},201);
}
async function listBodyMap(db,session,url){
  const clientId=clean(url.searchParams.get('clientId')); if(!clientId)return json({error:{code:'VALIDATION_ERROR',message:'Choose a client.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404);
  const records=await db.prepare(`SELECT b.*,u.display_name AS created_by_name,(SELECT COUNT(*) FROM body_map_updates x WHERE x.body_map_record_id=b.id) AS update_count FROM body_map_records b LEFT JOIN users u ON u.id=b.created_by AND u.organisation_id=b.organisation_id WHERE b.organisation_id=? AND b.client_id=? ORDER BY CASE b.status WHEN 'open' THEN 0 ELSE 1 END,b.first_observed_at DESC`).bind(session.organisation_id,clientId).all();
  return json({records:records.results||[]});
}
async function createBodyMapRecord(request,db,session){
  const i=await readJson(request),clientId=clean(i.clientId),description=clean(i.description); if(!clientId||!description)return json({error:{code:'VALIDATION_ERROR',message:'Client and description are required.'}},400);
  if(!await ensureOrganisationClient(db,session,clientId))return json({error:{code:'NOT_FOUND',message:'Client not found.'}},404); const id=crypto.randomUUID();
  await db.batch([db.prepare(`INSERT INTO body_map_records(id,organisation_id,client_id,view,x_percent,y_percent,concern_type,body_location,description,size,appearance,severity,action_taken,monitoring_plan,status,first_observed_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clientId,clean(i.view)||'front',Number(i.xPercent)||50,Number(i.yPercent)||50,clean(i.concernType)||'other',clean(i.bodyLocation),description,clean(i.size),clean(i.appearance),clean(i.severity)||'medium',clean(i.actionTaken),clean(i.monitoringPlan),'open',clean(i.firstObservedAt)||new Date().toISOString(),session.user_id),auditStatement(db,session.organisation_id,session.user_id,'body_map.created','body_map_record',id,{clientId,concernType:clean(i.concernType)})]); return json({ok:true,id},201);
}
async function updateBodyMapRecord(request,db,session,id){
  const row=await db.prepare('SELECT * FROM body_map_records WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first(); if(!row)return json({error:{code:'NOT_FOUND',message:'Body map concern not found.'}},404); const i=await readJson(request),note=clean(i.note); if(!note)return json({error:{code:'VALIDATION_ERROR',message:'Enter a progress note.'}},400); const status=clean(i.status)||row.status,uid=crypto.randomUUID();
  await db.batch([db.prepare(`INSERT INTO body_map_updates(id,organisation_id,body_map_record_id,note,appearance,action_taken,status,recorded_by) VALUES(?,?,?,?,?,?,?,?)`).bind(uid,session.organisation_id,id,note,clean(i.appearance),clean(i.actionTaken),status,session.user_id),db.prepare(`UPDATE body_map_records SET status=?,resolved_at=CASE WHEN ?='resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(status,status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'body_map.updated','body_map_record',id,{status})]); return json({ok:true,id:uid},201);
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
  if(!hasRole(session,["owner","organisation_owner","organisation_admin"]))return forbidden();
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
async function createBranch(request,db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin"]))return forbidden();const i=await readJson(request),name=clean(i.name);if(!name)return json({error:{code:"VALIDATION_ERROR",message:"Enter a branch name."}},400);const id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO branches(id,organisation_id,name,code,address,phone,email,status) VALUES(?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),"active"),auditStatement(db,session.organisation_id,session.user_id,"branch.created","branch",id,{name})]);return json({branch:{id,name,status:"active"}},201);}
async function updateBranch(request,db,session,id){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin"]))return forbidden();const i=await readJson(request),name=clean(i.name),status=clean(i.status)||"active";if(!name)return json({error:{code:"VALIDATION_ERROR",message:"Enter a branch name."}},400);if(!["active","inactive"].includes(status))return json({error:{code:"VALIDATION_ERROR",message:"Choose a valid branch status."}},400);const existing=await db.prepare("SELECT id,name,code,address,phone,email,status FROM branches WHERE id=? AND organisation_id=? LIMIT 1").bind(id,session.organisation_id).first();if(!existing)return json({error:{code:"NOT_FOUND",message:"Branch not found."}},404);await db.batch([db.prepare("UPDATE branches SET name=?,code=?,address=?,phone=?,email=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),status,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,"branch.updated","branch",id,{before:existing,after:{name,code:clean(i.code),address:clean(i.address),phone:clean(i.phone),email:clean(i.email),status}})]);return json({ok:true});}
async function listFamilyAccess(db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const r=await db.prepare(`SELECT f.*,u.display_name,u.email,c.first_name,c.last_name FROM family_client_access f JOIN users u ON u.id=f.user_id JOIN clients c ON c.id=f.client_id WHERE f.organisation_id=? ORDER BY u.display_name`).bind(session.organisation_id).all();return json({links:r.results});}
async function saveFamilyAccess(request,db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const i=await readJson(request),userId=clean(i.userId),clientId=clean(i.clientId);const user=await db.prepare("SELECT id FROM users WHERE id=? AND organisation_id=? AND access_level='family'").bind(userId,session.organisation_id).first(),client=await db.prepare("SELECT id FROM clients WHERE id=? AND organisation_id=?").bind(clientId,session.organisation_id).first();if(!user||!client)return json({error:{code:"VALIDATION_ERROR",message:"Choose a family user and client from this organisation."}},400);const id=crypto.randomUUID();await db.prepare(`INSERT INTO family_client_access(id,organisation_id,user_id,client_id,can_view_profile,can_view_visits,can_view_care_updates,can_view_documents,can_view_medication,status) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,client_id) DO UPDATE SET can_view_profile=excluded.can_view_profile,can_view_visits=excluded.can_view_visits,can_view_care_updates=excluded.can_view_care_updates,can_view_documents=excluded.can_view_documents,can_view_medication=excluded.can_view_medication,status='active'`).bind(id,session.organisation_id,userId,clientId,i.canViewProfile!==false?1:0,i.canViewVisits!==false?1:0,i.canViewCareUpdates!==false?1:0,i.canViewDocuments?1:0,i.canViewMedication?1:0,"active").run();return json({ok:true},201);}


// Sprint 12 — completed enterprise security services
const STANDARD_PERMISSION_MAP = {
  organisation_owner: ['*'], organisation_admin: ['dashboard.view','operations.view','operations.manage','rota.view','rota.create','rota.edit','rota.publish','rota.cancel','rota.time_critical.override','visits.view','visits.clock','visits.override','medication.view','medication.manage','tasks.view','tasks.manage','incidents.view','incidents.manage','finance.view','finance.manage','family_portal.manage','organisation.settings.view','organisation.settings.manage','security.roles.view','security.roles.manage','security.users.view','security.users.manage','security.audit.view','security.sessions.manage','clients.view','clients.create','clients.edit','clients.archive','staff.view','staff.create','staff.edit','care_plans.view','care_plans.create','care_plans.edit','care_plans.archive','risks.view','risks.manage','documents.view','documents.manage','reports.view','data.export'],
  branch_manager: ['dashboard.view','operations.view','operations.manage','rota.view','rota.create','rota.edit','rota.publish','visits.view','visits.clock','medication.view','medication.manage','tasks.view','tasks.manage','incidents.view','incidents.manage','family_portal.manage','organisation.settings.view','security.roles.view','security.users.view','clients.view','clients.create','clients.edit','staff.view','staff.create','staff.edit','care_plans.view','care_plans.create','care_plans.edit','risks.view','risks.manage','documents.view','documents.manage','reports.view'],
  senior_carer: ['dashboard.view','operations.view','visits.view','visits.clock','medication.view','medication.manage','tasks.view','tasks.manage','incidents.view','incidents.manage','clients.view','clients.edit','staff.view','care_plans.view','care_plans.create','care_plans.edit','risks.view','risks.manage','documents.view','documents.manage'],
  carer: ['dashboard.view','visits.view','visits.clock','tasks.view','medication.view','clients.view','staff.view','care_plans.view','risks.view','documents.view'],
  office_staff: ['dashboard.view','operations.view','rota.view','rota.create','rota.edit','rota.publish','visits.view','tasks.view','tasks.manage','incidents.view','family_portal.manage','organisation.settings.view','clients.view','clients.create','clients.edit','staff.view','staff.create','staff.edit','reports.view'],
  auditor: ['dashboard.view','operations.view','rota.view','visits.view','medication.view','tasks.view','incidents.view','finance.view','organisation.settings.view','security.roles.view','security.users.view','security.audit.view','clients.view','staff.view','care_plans.view','risks.view','documents.view','reports.view'],
  family: ['clients.view'], platform_owner: ['*'], platform_admin: ['*']
};
function canManageSecurity(session){return session.is_platform_user || ['organisation_owner','organisation_admin'].includes(session.access_level) || session.role==='owner';}
async function userHasPermission(db,session,key){
  if(session.is_platform_user || ['platform_owner','organisation_owner'].includes(session.access_level)) return true;
  const overrides=await db.prepare(`SELECT permission_key,effect FROM user_permission_overrides WHERE organisation_id=? AND user_id=?`).bind(session.organisation_id,session.user_id).all();
  const direct=overrides.results||[];
  if(direct.some(r=>r.permission_key===key&&r.effect==='deny')) return false;
  if(direct.some(r=>r.permission_key===key&&r.effect==='allow')) return true;
  const assignments=await db.prepare(`SELECT crp.permission_key,crp.effect FROM user_custom_roles ucr JOIN custom_roles cr ON cr.id=ucr.role_id AND cr.is_active=1 JOIN custom_role_permissions crp ON crp.role_id=cr.id WHERE ucr.user_id=? AND ucr.organisation_id=? AND (ucr.valid_from IS NULL OR datetime(ucr.valid_from)<=CURRENT_TIMESTAMP) AND (ucr.valid_until IS NULL OR datetime(ucr.valid_until)>CURRENT_TIMESTAMP) AND (ucr.branch_id IS NULL OR ucr.branch_id=?)`).bind(session.user_id,session.organisation_id,session.active_branch_id||session.home_branch_id||'').all();
  const rows=assignments.results||[];
  if(rows.some(r=>r.permission_key===key&&r.effect==='deny')) return false;
  if(rows.some(r=>r.permission_key===key&&r.effect==='allow')) return true;
  const standard=STANDARD_PERMISSION_MAP[session.access_level]||STANDARD_PERMISSION_MAP[session.role]||[];
  return standard.includes('*')||standard.includes(key);
}
async function listPermissionCatalogue(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.view'))return forbidden();const r=await db.prepare('SELECT * FROM permission_catalog ORDER BY category,name').all();return json({permissions:r.results||[]});}
async function listCustomRoles(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.view'))return forbidden();const r=await db.prepare(`SELECT cr.*,(SELECT COUNT(*) FROM custom_role_permissions p WHERE p.role_id=cr.id) permission_count,(SELECT COUNT(*) FROM user_custom_roles u WHERE u.role_id=cr.id) user_count FROM custom_roles cr WHERE cr.organisation_id=? AND cr.is_active=1 ORDER BY cr.name`).bind(session.organisation_id).all();for(const role of r.results||[]){const p=await db.prepare('SELECT permission_key,effect FROM custom_role_permissions WHERE role_id=? ORDER BY permission_key').bind(role.id).all();role.permissions=p.results||[];}return json({roles:r.results||[]});}
async function saveRole(request,db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.manage'))return forbidden();const i=await readJson(request),name=clean(i.name),description=clean(i.description),colour=clean(i.colour)||'#0f766e',permissions=Array.isArray(i.permissions)?[...new Set(i.permissions.map(clean).filter(Boolean))]:[];if(name.length<2)return json({error:{code:'VALIDATION_ERROR',message:'Enter a role name.'}},400);if(!id)id=crypto.randomUUID();const existing=await db.prepare('SELECT id FROM custom_roles WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();const statements=[];if(existing)statements.push(db.prepare('UPDATE custom_roles SET name=?,description=?,colour=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(name,description,colour,id,session.organisation_id));else statements.push(db.prepare('INSERT INTO custom_roles(id,organisation_id,name,description,colour,created_by) VALUES(?,?,?,?,?,?)').bind(id,session.organisation_id,name,description,colour,session.user_id));statements.push(db.prepare('DELETE FROM custom_role_permissions WHERE role_id=? AND EXISTS (SELECT 1 FROM custom_roles r WHERE r.id=role_id AND r.organisation_id=?)').bind(id,session.organisation_id));for(const key of permissions)statements.push(db.prepare('INSERT OR IGNORE INTO custom_role_permissions(role_id,permission_key,effect) SELECT ?,permission_key,? FROM permission_catalog WHERE permission_key=?').bind(id,'allow',key));statements.push(auditStatement(db,session.organisation_id,session.user_id,existing?'security.role_updated':'security.role_created','custom_role',id,{name,permissions}));await db.batch(statements);return json({ok:true,id},existing?200:201);}
async function createCustomRole(request,db,session){return saveRole(request,db,session,null)}
async function updateCustomRole(request,db,session,id){return saveRole(request,db,session,id)}
async function deleteCustomRole(db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.manage'))return forbidden();const role=await db.prepare('SELECT id,name FROM custom_roles WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!role)return json({error:{code:'NOT_FOUND',message:'Role not found.'}},404);await db.batch([db.prepare('DELETE FROM user_custom_roles WHERE role_id=? AND organisation_id=?').bind(id,session.organisation_id),db.prepare('UPDATE custom_roles SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'security.role_deleted','custom_role',id,{name:role.name})]);return json({ok:true});}
async function securityOverview(db,session){if(!canManageSecurity(session))return forbidden();const r=await db.prepare(`SELECT (SELECT COUNT(*) FROM custom_roles WHERE organisation_id=? AND is_active=1) customRoles,(SELECT COUNT(*) FROM users WHERE organisation_id=? AND status='active') activeUsers,(SELECT COUNT(*) FROM sessions WHERE organisation_id=? AND datetime(expires_at)>CURRENT_TIMESTAMP) activeSessions,(SELECT COUNT(*) FROM audit_log WHERE organisation_id=? AND created_at>=datetime('now','-1 day') AND action LIKE 'security.%') securityEvents24h`).bind(session.organisation_id,session.organisation_id,session.organisation_id,session.organisation_id).first();return json(r||{});}
async function listActiveSessions(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.sessions.manage'))return forbidden();const r=await db.prepare(`SELECT s.id,s.user_id,s.created_at,s.last_seen_at,s.expires_at,s.user_agent,s.ip_hint,u.display_name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.organisation_id=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP ORDER BY s.last_seen_at DESC`).bind(session.organisation_id).all();return json({sessions:r.results||[],currentSessionId:session.session_id});}
async function revokeSession(db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.sessions.manage'))return forbidden();if(id===session.session_id)return json({error:{code:'CURRENT_SESSION',message:'Use sign out to end your current session.'}},400);const target=await db.prepare('SELECT id,user_id FROM sessions WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();if(!target)return json({error:{code:'NOT_FOUND',message:'Session not found.'}},404);await db.batch([db.prepare('DELETE FROM sessions WHERE id=? AND organisation_id=?').bind(id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,'security.session_revoked','session',id,{targetUserId:target.user_id})]);return json({ok:true});}
async function getSecurityPolicy(db,session){if(!canManageSecurity(session))return forbidden();await db.prepare('INSERT OR IGNORE INTO organisation_security_policies(organisation_id) VALUES(?)').bind(session.organisation_id).run();const p=await db.prepare('SELECT * FROM organisation_security_policies WHERE organisation_id=?').bind(session.organisation_id).first();return json({policy:p});}
async function updateSecurityPolicy(request,db,session){if(!canManageSecurity(session))return forbidden();const i=await readJson(request),hours=Math.max(1,Math.min(168,Number(i.sessionHours)||12)),idle=Math.max(5,Math.min(1440,Number(i.idleTimeoutMinutes)||60));if(i.allowPasswordLogin===false && !i.requireMfa)return json({error:{code:'LOCKOUT_RISK',message:'Keep password sign-in enabled until another verified sign-in method is active.'}},400);await db.batch([db.prepare(`INSERT INTO organisation_security_policies(organisation_id,require_mfa,session_hours,idle_timeout_minutes,allow_password_login,require_trusted_device,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(organisation_id) DO UPDATE SET require_mfa=excluded.require_mfa,session_hours=excluded.session_hours,idle_timeout_minutes=excluded.idle_timeout_minutes,allow_password_login=excluded.allow_password_login,require_trusted_device=excluded.require_trusted_device,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,i.requireMfa?1:0,hours,idle,i.allowPasswordLogin===false?0:1,i.requireTrustedDevice?1:0),auditStatement(db,session.organisation_id,session.user_id,'security.policy_updated','organisation_security_policy',session.organisation_id,{hours,idle,requireMfa:!!i.requireMfa,requireTrustedDevice:!!i.requireTrustedDevice})]);return getSecurityPolicy(db,session);}
async function listLoginHistory(db,session){if(!canManageSecurity(session))return forbidden();const r=await db.prepare(`SELECT lh.*,u.display_name,u.email FROM login_history lh LEFT JOIN users u ON u.id=lh.user_id WHERE lh.organisation_id=? ORDER BY lh.created_at DESC LIMIT 100`).bind(session.organisation_id).all();return json({events:r.results||[]});}
async function effectiveAccess(db,session,url){if(!canManageSecurity(session))return forbidden();const userId=clean(url.searchParams.get('userId'));const user=await db.prepare('SELECT id,display_name,email,access_level,home_branch_id FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();if(!user)return json({error:{code:'NOT_FOUND',message:'User not found.'}},404);const catalog=await db.prepare('SELECT permission_key,category,name,risk_level FROM permission_catalog ORDER BY category,name').all();const fake={...session,user_id:user.id,access_level:user.access_level,home_branch_id:user.home_branch_id,is_platform_user:0};const permissions=[];for(const p of catalog.results||[])if(await userHasPermission(db,fake,p.permission_key))permissions.push(p);return json({user,permissions});}
async function updateEmergencyMode(request,db,session){if(!canManageSecurity(session))return forbidden();const i=await readJson(request),enabled=!!i.enabled,reason=clean(i.reason);if(enabled&&reason.length<8)return json({error:{code:'REASON_REQUIRED',message:'Enter a clear reason for enabling emergency mode.'}},400);await db.batch([db.prepare(`INSERT INTO organisation_security_policies(organisation_id,emergency_mode,emergency_reason,emergency_started_at,emergency_started_by) VALUES(?,?,?,?,?) ON CONFLICT(organisation_id) DO UPDATE SET emergency_mode=excluded.emergency_mode,emergency_reason=excluded.emergency_reason,emergency_started_at=excluded.emergency_started_at,emergency_started_by=excluded.emergency_started_by,updated_at=CURRENT_TIMESTAMP`).bind(session.organisation_id,enabled?1:0,enabled?reason:null,enabled?new Date().toISOString():null,enabled?session.user_id:null),auditStatement(db,session.organisation_id,session.user_id,enabled?'security.emergency_mode_enabled':'security.emergency_mode_disabled','organisation',session.organisation_id,{reason})]);return getSecurityPolicy(db,session);}

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
  const user=await db.prepare('SELECT id,display_name,email,access_level FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();
  if(!user)return notFound('User');
  const rows=await db.prepare('SELECT permission_key,effect FROM user_permission_overrides WHERE organisation_id=? AND user_id=? ORDER BY permission_key').bind(session.organisation_id,userId).all();
  return json({user,overrides:rows.results||[]});
}
async function updateUserPermissionOverrides(request,db,session,userId){
  if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.users.manage'))return forbidden();
  const user=await db.prepare('SELECT id FROM users WHERE id=? AND organisation_id=?').bind(userId,session.organisation_id).first();if(!user)return notFound('User');
  const input=await readJson(request),allow=Array.isArray(input.allow)?[...new Set(input.allow.map(clean).filter(Boolean))]:[],deny=Array.isArray(input.deny)?[...new Set(input.deny.map(clean).filter(Boolean))]:[];
  const statements=[db.prepare('DELETE FROM user_permission_overrides WHERE organisation_id=? AND user_id=?').bind(session.organisation_id,userId)];
  for(const key of allow.filter(x=>!deny.includes(x)))statements.push(db.prepare(`INSERT INTO user_permission_overrides(organisation_id,user_id,permission_key,effect,assigned_by) SELECT ?,?,permission_key,'allow',? FROM permission_catalog WHERE permission_key=?`).bind(session.organisation_id,userId,session.user_id,key));
  for(const key of deny)statements.push(db.prepare(`INSERT INTO user_permission_overrides(organisation_id,user_id,permission_key,effect,assigned_by) SELECT ?,?,permission_key,'deny',? FROM permission_catalog WHERE permission_key=?`).bind(session.organisation_id,userId,session.user_id,key));
  statements.push(auditStatement(db,session.organisation_id,session.user_id,'security.user_permissions_updated','user',userId,{allow,deny}));await db.batch(statements);return json({ok:true});
}
