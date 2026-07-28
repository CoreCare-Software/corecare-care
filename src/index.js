/** CoreCare Enterprise 1.1.2 — Customer Success Centre */
const VERSION = "1.1.2";
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
      if (url.pathname === "/api/version") return json({ name: "CoreCare", version: VERSION, release: "CoreCare Enterprise 1.1.2 — Customer Success Centre" });
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
        if (url.pathname === "/api/care-plans" && request.method === "GET") return listAllCarePlans(env.DB, session, url);
        if (url.pathname === "/api/platform/dashboard" && request.method === "GET") return platformDashboard(env.DB, session);
        if (url.pathname === "/api/platform/revenue" && request.method === "GET") return platformRevenue(env.DB, session);
        if (url.pathname === "/api/platform/customer-success" && request.method === "GET") return platformCustomerSuccess(env.DB, session);
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
          if (request.method === "GET") return listStaff(env.DB, session, url);
          if (request.method === "POST") return createStaff(request, env.DB, session);
          return methodNotAllowed(["GET", "POST"]);
        }
        const staffMatch = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
        if (staffMatch) {
          const id = decodeURIComponent(staffMatch[1]);
          if (request.method === "PUT") return updateStaff(request, env.DB, session, id);
          return methodNotAllowed(["PUT"]);
        }
        const clientCareMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/(care-plans|risks|documents)$/);
        if (clientCareMatch) {
          const clientId = decodeURIComponent(clientCareMatch[1]);
          const module = clientCareMatch[2];
          if (module === "care-plans") {
            if (request.method === "GET") return listCarePlans(env.DB, session, clientId);
            if (request.method === "POST") return createCarePlan(request, env.DB, session, clientId);
          }
          if (module === "risks") {
            if (request.method === "GET") return listRisks(env.DB, session, clientId);
            if (request.method === "POST") return createRisk(request, env.DB, session, clientId);
          }
          if (module === "documents") {
            if (request.method === "GET") return listDocuments(env.DB, session, clientId);
            if (request.method === "POST") return createDocument(request, env.DB, session, clientId);
          }
          return methodNotAllowed(["GET", "POST"]);
        }
        const carePlanMatch = url.pathname.match(/^\/api\/care-plans\/([^/]+)$/);
        if (carePlanMatch) {
          const id = decodeURIComponent(carePlanMatch[1]);
          if (request.method === "PUT") return updateCarePlan(request, env.DB, session, id);
          if (request.method === "DELETE") return archiveCarePlan(env.DB, session, id);
          return methodNotAllowed(["PUT", "DELETE"]);
        }
        const riskMatch = url.pathname.match(/^\/api\/risks\/([^/]+)$/);
        if (riskMatch) {
          const id = decodeURIComponent(riskMatch[1]);
          if (request.method === "PUT") return updateRisk(request, env.DB, session, id);
          return methodNotAllowed(["PUT"]);
        }
        const documentMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
        if (documentMatch) {
          const id = decodeURIComponent(documentMatch[1]);
          if (request.method === "DELETE") return archiveDocument(env.DB, session, id);
          return methodNotAllowed(["DELETE"]);
        }
        if (url.pathname === "/api/clients") {
          if (request.method === "GET") return listClients(env.DB, session, url);
          if (request.method === "POST") return createClient(request, env.DB, session);
          return methodNotAllowed(["GET", "POST"]);
        }
        const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
        if (clientMatch) {
          const id = decodeURIComponent(clientMatch[1]);
          if (request.method === "GET") return getClient(env.DB, session, id);
          if (request.method === "PUT") return updateClient(request, env.DB, session, id);
          if (request.method === "DELETE") return archiveClient(env.DB, session, id);
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
  return json({ user: publicUser(session), expiresAt: session.expires_at });
}

async function requireSession(request, db) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return unauthorised();
  const row = await db.prepare(`SELECT s.id AS session_id,s.expires_at,s.user_id,s.organisation_id,s.active_branch_id,s.support_mode,s.support_origin_organisation_id,s.support_started_at,
    (SELECT ss.reason FROM support_sessions ss WHERE ss.session_id=s.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS support_reason,
    (SELECT ss.access_mode FROM support_sessions ss WHERE ss.session_id=s.id AND ss.ended_at IS NULL ORDER BY ss.started_at DESC LIMIT 1) AS support_access_mode,
    u.email,u.display_name,u.role,u.access_level,u.is_platform_user,u.home_branch_id,u.status,u.must_change_password,o.name AS organisation_name,b.name AS branch_name
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
  const input = normaliseClient(await readJson(request));
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const id = crypto.randomUUID();
  const fields = clientFields(input);
  await db.batch([
    db.prepare(`INSERT INTO clients (id,organisation_id,branch_id,${fields.names.join(",")}) VALUES (?, ?, ?, ${fields.names.map(() => "?").join(",")})`).bind(id, session.organisation_id, activeBranch(session), ...fields.values),
    auditStatement(db, session.organisation_id, session.user_id, "client.created", "client", id, { name: `${input.firstName} ${input.lastName}` })
  ]);
  return json({ client: { ...input, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, 201);
}

async function updateClient(request, db, session, id) {
  if (!hasRole(session, ["owner", "manager", "carer"])) return forbidden();
  const input = normaliseClient(await readJson(request));
  const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const fields = clientFields(input);
  const assignments = fields.names.map(name => `${name}=?`).join(",");
  const result = await db.prepare(`UPDATE clients SET ${assignments},archived_at=CASE WHEN ?='Archived' THEN COALESCE(archived_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(...fields.values, input.status, id, session.organisation_id).run();
  if (!result.meta.changes) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
  await audit(db, session.organisation_id, session.user_id, "client.updated", "client", id, { name: `${input.firstName} ${input.lastName}` });
  return getClient(db, session, id);
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


async function dashboardSummary(db, session) {
  const [clients, staff, plans, risks, auditRows] = await Promise.all([
    db.prepare("SELECT status,risk,next_review FROM clients WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare("SELECT status,dbs_expiry,training_expiry FROM staff WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare("SELECT status,review_date FROM care_plans WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare("SELECT status,severity,review_date FROM risk_assessments WHERE organisation_id=?").bind(session.organisation_id).all(),
    db.prepare(`SELECT a.action,a.entity_type,a.created_at,u.display_name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT 6`).bind(session.organisation_id).all()
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

const STAFF_COLUMNS = `id,first_name,last_name,preferred_name,job_title,employment_type,phone,email,start_date,status,dbs_expiry,training_expiry,notes,created_at,updated_at`;
async function listStaff(db, session, url) {
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const result = await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff WHERE organisation_id=? ${branchRestricted(session)?"AND branch_id=?":""} ${includeInactive ? "" : "AND status='Active'"} ORDER BY last_name COLLATE NOCASE,first_name COLLATE NOCASE`).bind(session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).all();
  return json({ staff: result.results.map(toStaff) });
}
async function createStaff(request, db, session) {
  if (!hasRole(session,["owner","manager"])) return forbidden();
  const input = await readJson(request); const v = validateStaff(input); if (v.error) return json({error:{code:"VALIDATION_ERROR",message:v.error}},400);
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO staff (id,organisation_id,branch_id,first_name,last_name,preferred_name,job_title,employment_type,phone,email,start_date,status,dbs_expiry,training_expiry,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,activeBranch(session),...v.values),
    auditStatement(db,session.organisation_id,session.user_id,"staff.created","staff",id,{name:`${v.values[0]} ${v.values[1]}`})
  ]);
  const row=await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff WHERE id=?`).bind(id).first(); return json({staff:toStaff(row)},201);
}
async function updateStaff(request, db, session, id) {
  if (!hasRole(session,["owner","manager"])) return forbidden();
  const input=await readJson(request); const v=validateStaff(input); if(v.error) return json({error:{code:"VALIDATION_ERROR",message:v.error}},400);
  const result=await db.prepare(`UPDATE staff SET first_name=?,last_name=?,preferred_name=?,job_title=?,employment_type=?,phone=?,email=?,start_date=?,status=?,dbs_expiry=?,training_expiry=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(...v.values,id,session.organisation_id).run();
  if(!result.meta.changes) return json({error:{code:"STAFF_NOT_FOUND",message:"Staff record not found."}},404);
  await audit(db,session.organisation_id,session.user_id,"staff.updated","staff",id,{status:v.values[8]});
  const row=await db.prepare(`SELECT ${STAFF_COLUMNS} FROM staff WHERE id=?`).bind(id).first(); return json({staff:toStaff(row)});
}
function validateStaff(input){
  const values=[clean(input.firstName),clean(input.lastName),clean(input.preferredName),clean(input.jobTitle)||"Carer",clean(input.employmentType)||"Employee",clean(input.phone),clean(input.email),clean(input.startDate),clean(input.status)||"Active",clean(input.dbsExpiry),clean(input.trainingExpiry),clean(input.notes)];
  if(!values[0]||!values[1]) return {error:"Enter the staff member's first and last name."};
  if(!["Active","Inactive"].includes(values[8])) return {error:"Choose a valid staff status."};
  return {values};
}
function toStaff(row){return {id:row.id,firstName:row.first_name,lastName:row.last_name,preferredName:row.preferred_name||"",jobTitle:row.job_title,employmentType:row.employment_type,phone:row.phone||"",email:row.email||"",startDate:row.start_date||"",status:row.status,dbsExpiry:row.dbs_expiry||"",trainingExpiry:row.training_expiry||"",notes:row.notes||"",createdAt:row.created_at,updatedAt:row.updated_at};}


async function ensureClient(db, session, clientId) {
  return db.prepare(`SELECT id,branch_id FROM clients WHERE id=? AND organisation_id=? ${branchRestricted(session)?"AND branch_id=?":""}`).bind(clientId, session.organisation_id,...(branchRestricted(session)?[activeBranch(session)]:[])).first();
}
function carePlanInput(input) {
  const keys=["title","status","effectiveDate","reviewDate","authorName","personalDetails","medicalConditions","communication","mobility","nutritionHydration","medicationSupport","continence","skinIntegrity","mentalCapacity","risks","desiredOutcomes"];
  const v={}; for(const k of keys)v[k]=clean(input[k]);
  if(!v.title || !v.reviewDate) return {error:"Enter a care-plan title and review date."};
  if(!["Draft","Active","Archived"].includes(v.status)) v.status="Draft";
  return {v};
}
async function listCarePlans(db, session, clientId){
  if(!await ensureClient(db,session,clientId)) return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);
  const r=await db.prepare("SELECT * FROM care_plans WHERE organisation_id=? AND client_id=? ORDER BY CASE status WHEN 'Active' THEN 0 WHEN 'Draft' THEN 1 ELSE 2 END, review_date").bind(session.organisation_id,clientId).all();
  return json({carePlans:r.results.map(toCarePlan)});
}

async function listAllCarePlans(db, session, url){
  const status=clean(url.searchParams.get("status"));
  const params=[session.organisation_id];
  let where="cp.organisation_id=?";
  if(status && ["Draft","Active","Archived"].includes(status)){
    where+=" AND cp.status=?";
    params.push(status);
  }
  const result=await db.prepare(`
    SELECT cp.*, c.first_name, c.last_name, c.preferred_name
    FROM care_plans cp
    JOIN clients c ON c.id=cp.client_id AND c.organisation_id=cp.organisation_id
    WHERE ${where}
    ORDER BY CASE cp.status WHEN 'Active' THEN 0 WHEN 'Draft' THEN 1 ELSE 2 END,
             cp.review_date,
             c.last_name COLLATE NOCASE,
             c.first_name COLLATE NOCASE
  `).bind(...params).all();
  return json({carePlans:result.results.map(row=>({
    ...toCarePlan(row),
    clientName:[row.preferred_name||row.first_name,row.last_name].filter(Boolean).join(" ")
  }))});
}
async function createCarePlan(request,db,session,clientId){
  if(!hasRole(session,["owner","manager","carer"])) return forbidden();
  if(!await ensureClient(db,session,clientId)) return json({error:{code:"CLIENT_NOT_FOUND",message:"Client not found."}},404);
  const parsed=carePlanInput(await readJson(request)); if(parsed.error)return json({error:{code:"VALIDATION_ERROR",message:parsed.error}},400); const v=parsed.v,id=crypto.randomUUID();
  await db.batch([db.prepare(`INSERT INTO care_plans (id,organisation_id,branch_id,client_id,title,status,effective_date,review_date,author_name,personal_details,medical_conditions,communication,mobility,nutrition_hydration,medication_support,continence,skin_integrity,mental_capacity,risks,desired_outcomes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,activeBranch(session),clientId,v.title,v.status,v.effectiveDate||null,v.reviewDate,v.authorName,v.personalDetails,v.medicalConditions,v.communication,v.mobility,v.nutritionHydration,v.medicationSupport,v.continence,v.skinIntegrity,v.mentalCapacity,v.risks,v.desiredOutcomes,session.user_id),auditStatement(db,session.organisation_id,session.user_id,"care_plan.created","care_plan",id,{clientId,title:v.title,status:v.status})]);
  const row=await db.prepare("SELECT * FROM care_plans WHERE id=?").bind(id).first(); return json({carePlan:toCarePlan(row)},201);
}
async function updateCarePlan(request,db,session,id){
  if(!hasRole(session,["owner","manager","carer"])) return forbidden(); const existing=await db.prepare("SELECT * FROM care_plans WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).first(); if(!existing)return json({error:{code:"NOT_FOUND",message:"Care plan not found."}},404);
  const parsed=carePlanInput(await readJson(request)); if(parsed.error)return json({error:{code:"VALIDATION_ERROR",message:parsed.error}},400); const v=parsed.v,next=Number(existing.version||1)+1;
  await db.batch([db.prepare("INSERT INTO care_plan_versions (id,organisation_id,care_plan_id,version,snapshot_json,created_by) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),session.organisation_id,id,existing.version||1,JSON.stringify(toCarePlan(existing)),session.user_id),db.prepare(`UPDATE care_plans SET title=?,status=?,version=?,effective_date=?,review_date=?,author_name=?,personal_details=?,medical_conditions=?,communication=?,mobility=?,nutrition_hydration=?,medication_support=?,continence=?,skin_integrity=?,mental_capacity=?,risks=?,desired_outcomes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(v.title,v.status,next,v.effectiveDate||null,v.reviewDate,v.authorName,v.personalDetails,v.medicalConditions,v.communication,v.mobility,v.nutritionHydration,v.medicationSupport,v.continence,v.skinIntegrity,v.mentalCapacity,v.risks,v.desiredOutcomes,id,session.organisation_id),auditStatement(db,session.organisation_id,session.user_id,"care_plan.updated","care_plan",id,{version:next,status:v.status})]);
  return json({carePlan:toCarePlan(await db.prepare("SELECT * FROM care_plans WHERE id=?").bind(id).first())});
}
async function archiveCarePlan(db,session,id){if(!hasRole(session,["owner","manager"]))return forbidden();const r=await db.prepare("UPDATE care_plans SET status='Archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Care plan not found."}},404);await audit(db,session.organisation_id,session.user_id,"care_plan.archived","care_plan",id,{});return json({ok:true});}
function toCarePlan(r){return {id:r.id,clientId:r.client_id,title:r.title,status:r.status,version:r.version,effectiveDate:r.effective_date||"",reviewDate:r.review_date,authorName:r.author_name||"",personalDetails:r.personal_details||"",medicalConditions:r.medical_conditions||"",communication:r.communication||"",mobility:r.mobility||"",nutritionHydration:r.nutrition_hydration||"",medicationSupport:r.medication_support||"",continence:r.continence||"",skinIntegrity:r.skin_integrity||"",mentalCapacity:r.mental_capacity||"",risks:r.risks||"",desiredOutcomes:r.desired_outcomes||"",createdAt:r.created_at,updatedAt:r.updated_at};}

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
  const result = await db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail_json,a.created_at,u.display_name AS user_name,u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(session.organisation_id, limit).all();
  return json({ events: result.results });
}

function developmentStatus(env, session) {
  return json({ database: { connected: Boolean(env.DB), binding: "DB" }, authentication: { mode: "D1 sessions", cookie: SESSION_COOKIE }, user: publicUser(session), organisation: { id: session.organisation_id, name: session.organisation_name }, deployment: { version: VERSION, checkedAt: new Date().toISOString() } });
}

function allowedRoles() { return ["owner", "manager", "carer", "auditor"]; }
function allowedAccessLevels(){return ["organisation_owner","organisation_admin","branch_manager","senior_carer","carer","office_staff","auditor","family"]; }
function legacyRole(level){return ({organisation_owner:"owner",organisation_admin:"owner",branch_manager:"manager",senior_carer:"carer",carer:"carer",office_staff:"manager",auditor:"auditor",family:"auditor"})[level]||"auditor";}
function hasRole(session, roles) { if (session.is_platform_user) return true; return roles.includes(session.role) || roles.includes(session.access_level); }
function forbidden() { return json({ error: { code: "FORBIDDEN", message: "Your account does not have permission to perform this action." } }, 403); }
function unauthorised() { return json({ error: { code: "UNAUTHORISED", message: "Sign in to continue." } }, 401, { "set-cookie": expiredSessionCookie() }); }
function databaseRequired(message = "The D1 database binding named DB is not configured.") { return json({ error: { code: "DATABASE_NOT_CONFIGURED", message } }, 503); }
function methodNotAllowed(allow) { return json({ error: { code: "METHOD_NOT_ALLOWED", message: "This method is not allowed." } }, 405, { allow: allow.join(", ") }); }
function publicUser(row) { return { id: row.user_id || row.id, organisationId: row.organisation_id, organisationName: row.organisation_name, branchId: row.active_branch_id || row.home_branch_id || null, branchName: row.branch_name || null, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, isPlatformUser: Boolean(row.is_platform_user), supportMode: Boolean(row.support_mode), supportOriginOrganisationId: row.support_origin_organisation_id || null, supportStartedAt: row.support_started_at || null, supportReason: row.support_reason || null, supportAccessMode: row.support_access_mode || null, mustChangePassword: Boolean(row.must_change_password) }; }
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
  const [sessions,errors,auditCount]=await Promise.all([
    db.prepare("SELECT COUNT(*) total FROM sessions WHERE expires_at>CURRENT_TIMESTAMP").first(),
    db.prepare("SELECT COUNT(*) total FROM api_error_log WHERE created_at>=datetime('now','-24 hours')").first(),
    db.prepare("SELECT COUNT(*) total FROM audit_log WHERE created_at>=datetime('now','-24 hours')").first()
  ]);
  return json({database:'healthy',activeSessions:Number(sessions?.total||0),errors24h:Number(errors?.total||0),auditEvents24h:Number(auditCount?.total||0),workerVersion:VERSION,checkedAt:new Date().toISOString()});
}
async function listSubscriptionPlans(db,session){if(!requirePlatform(session))return forbidden();const r=await db.prepare("SELECT * FROM subscription_plans ORDER BY monthly_price_pence,name").all();return json({plans:r.results||[]});}
async function saveSubscriptionPlan(request,db,session){
  if(!requirePlatform(session)||session.access_level!=='platform_owner')return forbidden();const i=await readJson(request),name=clean(i.name),id=clean(i.id)||name.toLowerCase().replace(/[^a-z0-9]+/g,'-');if(!name)return json({error:{code:'VALIDATION_ERROR',message:'Enter a plan name.'}},400);
  await db.prepare(`INSERT INTO subscription_plans(id,name,monthly_price_pence,max_users,max_clients,max_branches,storage_mb,feature_flags_json,status) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,monthly_price_pence=excluded.monthly_price_pence,max_users=excluded.max_users,max_clients=excluded.max_clients,max_branches=excluded.max_branches,storage_mb=excluded.storage_mb,feature_flags_json=excluded.feature_flags_json,status=excluded.status,updated_at=CURRENT_TIMESTAMP`).bind(id,name,Number(i.monthlyPricePence)||0,nullableNumber(i.maxUsers),nullableNumber(i.maxClients),nullableNumber(i.maxBranches),Number(i.storageMb)||1024,typeof i.featureFlags==='object'?JSON.stringify(i.featureFlags):'{}',clean(i.status)||'active').run();
  await audit(db,session.organisation_id,session.user_id,'platform.plan_saved','subscription_plan',id,{name});return json({ok:true,id},201);
}
async function listPlatformUsers(db,session){if(!requirePlatform(session))return forbidden();const r=await db.prepare(`SELECT u.id,u.email,u.display_name,u.access_level,u.status,u.last_login_at,o.name AS organisation_name FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE u.is_platform_user=1 OR u.access_level IN ('platform_owner','platform_admin') ORDER BY u.display_name`).all();return json({users:r.results||[]});}

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
    (SELECT COUNT(*) FROM branches b WHERE b.organisation_id=o.id) branch_count,
    (SELECT COUNT(*) FROM users u WHERE u.organisation_id=o.id) user_count,
    (SELECT COUNT(*) FROM clients c WHERE c.organisation_id=o.id AND c.status<>'Archived') client_count,
    (SELECT COUNT(*) FROM staff st WHERE st.organisation_id=o.id AND st.status='Active') staff_count
    FROM organisations o WHERE o.id=?`).bind(id).first();
  if(!org)return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404);
  const support=await db.prepare(`SELECT ss.*,u.display_name FROM support_sessions ss LEFT JOIN users u ON u.id=ss.platform_user_id WHERE ss.organisation_id=? ORDER BY ss.started_at DESC LIMIT 20`).bind(id).all();
  return json({organisation:normaliseOrganisation(org),supportHistory:support.results||[]});
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
async function updateBranch(request,db,session,id){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin"]))return forbidden();const i=await readJson(request),name=clean(i.name),status=clean(i.status)||"active";const r=await db.prepare("UPDATE branches SET name=?,code=?,address=?,phone=?,email=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),status,id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Branch not found."}},404);return json({ok:true});}
async function listFamilyAccess(db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const r=await db.prepare(`SELECT f.*,u.display_name,u.email,c.first_name,c.last_name FROM family_client_access f JOIN users u ON u.id=f.user_id JOIN clients c ON c.id=f.client_id WHERE f.organisation_id=? ORDER BY u.display_name`).bind(session.organisation_id).all();return json({links:r.results});}
async function saveFamilyAccess(request,db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const i=await readJson(request),userId=clean(i.userId),clientId=clean(i.clientId);const user=await db.prepare("SELECT id FROM users WHERE id=? AND organisation_id=? AND access_level='family'").bind(userId,session.organisation_id).first(),client=await db.prepare("SELECT id FROM clients WHERE id=? AND organisation_id=?").bind(clientId,session.organisation_id).first();if(!user||!client)return json({error:{code:"VALIDATION_ERROR",message:"Choose a family user and client from this organisation."}},400);const id=crypto.randomUUID();await db.prepare(`INSERT INTO family_client_access(id,organisation_id,user_id,client_id,can_view_profile,can_view_visits,can_view_care_updates,can_view_documents,can_view_medication,status) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,client_id) DO UPDATE SET can_view_profile=excluded.can_view_profile,can_view_visits=excluded.can_view_visits,can_view_care_updates=excluded.can_view_care_updates,can_view_documents=excluded.can_view_documents,can_view_medication=excluded.can_view_medication,status='active'`).bind(id,session.organisation_id,userId,clientId,i.canViewProfile!==false?1:0,i.canViewVisits!==false?1:0,i.canViewCareUpdates!==false?1:0,i.canViewDocuments?1:0,i.canViewMedication?1:0,"active").run();return json({ok:true},201);}


// Sprint 12 — completed enterprise security services
const STANDARD_PERMISSION_MAP = {
  organisation_owner: ['*'], organisation_admin: ['organisation.settings.view','organisation.settings.manage','security.roles.view','security.roles.manage','security.users.view','security.users.manage','security.audit.view','security.sessions.manage','clients.view','clients.create','clients.edit','clients.archive','staff.view','staff.create','staff.edit','care_plans.view','care_plans.create','care_plans.edit','care_plans.archive','risks.view','risks.manage','documents.view','documents.manage','reports.view','data.export'],
  branch_manager: ['organisation.settings.view','security.roles.view','security.users.view','clients.view','clients.create','clients.edit','staff.view','staff.create','staff.edit','care_plans.view','care_plans.create','care_plans.edit','risks.view','risks.manage','documents.view','documents.manage','reports.view'],
  senior_carer: ['clients.view','clients.edit','staff.view','care_plans.view','care_plans.create','care_plans.edit','risks.view','risks.manage','documents.view','documents.manage'],
  carer: ['clients.view','staff.view','care_plans.view','risks.view','documents.view'],
  office_staff: ['organisation.settings.view','clients.view','clients.create','clients.edit','staff.view','staff.create','staff.edit','reports.view'],
  auditor: ['organisation.settings.view','security.roles.view','security.users.view','security.audit.view','clients.view','staff.view','care_plans.view','risks.view','documents.view','reports.view'],
  family: ['clients.view'], platform_owner: ['*'], platform_admin: ['*']
};
function canManageSecurity(session){return session.is_platform_user || ['organisation_owner','organisation_admin'].includes(session.access_level) || session.role==='owner';}
async function userHasPermission(db,session,key){
  if(session.is_platform_user || ['platform_owner','organisation_owner'].includes(session.access_level)) return true;
  const assignments=await db.prepare(`SELECT crp.permission_key,crp.effect FROM user_custom_roles ucr JOIN custom_roles cr ON cr.id=ucr.role_id AND cr.is_active=1 JOIN custom_role_permissions crp ON crp.role_id=cr.id WHERE ucr.user_id=? AND ucr.organisation_id=? AND (ucr.valid_from IS NULL OR datetime(ucr.valid_from)<=CURRENT_TIMESTAMP) AND (ucr.valid_until IS NULL OR datetime(ucr.valid_until)>CURRENT_TIMESTAMP) AND (ucr.branch_id IS NULL OR ucr.branch_id=?)`).bind(session.user_id,session.organisation_id,session.active_branch_id||session.home_branch_id||'').all();
  const rows=assignments.results||[];
  if(rows.some(r=>r.permission_key===key&&r.effect==='deny')) return false;
  if(rows.some(r=>r.permission_key===key&&r.effect==='allow')) return true;
  const standard=STANDARD_PERMISSION_MAP[session.access_level]||STANDARD_PERMISSION_MAP[session.role]||[];
  return standard.includes('*')||standard.includes(key);
}
async function listPermissionCatalogue(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.view'))return forbidden();const r=await db.prepare('SELECT * FROM permission_catalog ORDER BY category,name').all();return json({permissions:r.results||[]});}
async function listCustomRoles(db,session){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.view'))return forbidden();const r=await db.prepare(`SELECT cr.*,(SELECT COUNT(*) FROM custom_role_permissions p WHERE p.role_id=cr.id) permission_count,(SELECT COUNT(*) FROM user_custom_roles u WHERE u.role_id=cr.id) user_count FROM custom_roles cr WHERE cr.organisation_id=? AND cr.is_active=1 ORDER BY cr.name`).bind(session.organisation_id).all();for(const role of r.results||[]){const p=await db.prepare('SELECT permission_key,effect FROM custom_role_permissions WHERE role_id=? ORDER BY permission_key').bind(role.id).all();role.permissions=p.results||[];}return json({roles:r.results||[]});}
async function saveRole(request,db,session,id){if(!canManageSecurity(session)&&!await userHasPermission(db,session,'security.roles.manage'))return forbidden();const i=await readJson(request),name=clean(i.name),description=clean(i.description),colour=clean(i.colour)||'#0f766e',permissions=Array.isArray(i.permissions)?[...new Set(i.permissions.map(clean).filter(Boolean))]:[];if(name.length<2)return json({error:{code:'VALIDATION_ERROR',message:'Enter a role name.'}},400);if(!id)id=crypto.randomUUID();const existing=await db.prepare('SELECT id FROM custom_roles WHERE id=? AND organisation_id=?').bind(id,session.organisation_id).first();const statements=[];if(existing)statements.push(db.prepare('UPDATE custom_roles SET name=?,description=?,colour=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?').bind(name,description,colour,id,session.organisation_id));else statements.push(db.prepare('INSERT INTO custom_roles(id,organisation_id,name,description,colour,created_by) VALUES(?,?,?,?,?,?)').bind(id,session.organisation_id,name,description,colour,session.user_id));statements.push(db.prepare('DELETE FROM custom_role_permissions WHERE role_id=?').bind(id));for(const key of permissions)statements.push(db.prepare('INSERT OR IGNORE INTO custom_role_permissions(role_id,permission_key,effect) SELECT ?,permission_key,? FROM permission_catalog WHERE permission_key=?').bind(id,'allow',key));statements.push(auditStatement(db,session.organisation_id,session.user_id,existing?'security.role_updated':'security.role_created','custom_role',id,{name,permissions}));await db.batch(statements);return json({ok:true,id},existing?200:201);}
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
