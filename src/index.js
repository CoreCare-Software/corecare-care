/** CoreCare Cloudflare Worker — v0.5.0 client records */
const VERSION = "0.8.0";
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
      if (url.pathname === "/api/version") return json({ name: "CoreCare", version: VERSION, sprint: "Sprint 8 — multi-organisation and access control" });
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
        if (url.pathname === "/api/platform/organisations" && request.method === "GET") return listOrganisations(env.DB, session);
        if (url.pathname === "/api/platform/organisations" && request.method === "POST") return createOrganisation(request, env.DB, session);
        const orgMatch = url.pathname.match(/^\/api\/platform\/organisations\/([^/]+)$/);
        if (orgMatch && request.method === "PUT") return updateOrganisationAdmin(request, env.DB, session, decodeURIComponent(orgMatch[1]));
        if (url.pathname === "/api/platform/switch-organisation" && request.method === "POST") return switchOrganisation(request, env.DB, session);
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
  const row = await db.prepare(`SELECT s.id AS session_id,s.expires_at,s.user_id,s.organisation_id,s.active_branch_id,u.email,u.display_name,u.role,u.access_level,u.is_platform_user,u.home_branch_id,u.status,u.must_change_password,o.name AS organisation_name,b.name AS branch_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN organisations o ON o.id=s.organisation_id LEFT JOIN branches b ON b.id=s.active_branch_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(await sha256Base64(token)).first();
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
  const result = await db.prepare("SELECT id,email,display_name,role,access_level,home_branch_id,status,must_change_password,last_login_at,created_at FROM users WHERE organisation_id=? ORDER BY display_name COLLATE NOCASE").bind(session.organisation_id).all();
  return json({ users: result.results.map(toUser) });
}

async function createUser(request, db, session) {
  if (!hasRole(session, ["owner"])) return forbidden();
  const input = await readJson(request);
  const email = clean(input.email).toLowerCase();
  const name = clean(input.displayName);
  const accessLevel = clean(input.accessLevel || input.role);
  const role = legacyRole(accessLevel);
  const branchId = clean(input.branchId) || null;
  const password = String(input.temporaryPassword || "");
  if (!email || !name || !allowedAccessLevels().includes(accessLevel) || password.length < 12) return json({ error: { code: "VALIDATION_ERROR", message: "Enter a name, valid email, role and temporary password of at least 12 characters." } }, 400);
  const secured = await hashPassword(password);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id,organisation_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?, 'active',1)").bind(id, session.organisation_id, email, name, role, accessLevel, branchId, secured.hash, secured.salt, PASSWORD_ITERATIONS),
      auditStatement(db, session.organisation_id, session.user_id, "user.created", "user", id, { email, role, accessLevel, branchId })
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: { code: "EMAIL_EXISTS", message: "A user with that email already exists." } }, 409);
    throw error;
  }
  return json({ user: { id, email, displayName: name, role, accessLevel, branchId, status: "active", mustChangePassword: true } }, 201);
}

async function updateUser(request, db, session, id) {
  if (!hasRole(session, ["owner"])) return forbidden();
  if (id === session.user_id) return json({ error: { code: "SELF_EDIT_BLOCKED", message: "Use the password and profile controls for your own account." } }, 400);
  const input = await readJson(request);
  const name = clean(input.displayName), role = clean(input.role), status = clean(input.status);
  if (!name || !allowedAccessLevels().includes(accessLevel) || !["active", "disabled"].includes(status)) return json({ error: { code: "VALIDATION_ERROR", message: "Enter a name, valid role and status." } }, 400);
  const result = await db.prepare("UPDATE users SET display_name=?,role=?,access_level=?,home_branch_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name, role, accessLevel, branchId, status, id, session.organisation_id).run();
  if (!result.meta.changes) return json({ error: { code: "USER_NOT_FOUND", message: "User account not found." } }, 404);
  if (status === "disabled") await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  await audit(db, session.organisation_id, session.user_id, "user.updated", "user", id, { role, accessLevel, branchId, status });
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
function publicUser(row) { return { id: row.user_id || row.id, organisationId: row.organisation_id, organisationName: row.organisation_name, branchId: row.active_branch_id || row.home_branch_id || null, branchName: row.branch_name || null, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, isPlatformUser: Boolean(row.is_platform_user), mustChangePassword: Boolean(row.must_change_password) }; }
function toUser(row) { return { id: row.id, email: row.email, displayName: row.display_name, role: row.role, accessLevel: row.access_level || row.role, branchId: row.home_branch_id || null, status: row.status, mustChangePassword: Boolean(row.must_change_password), lastLoginAt: row.last_login_at, createdAt: row.created_at }; }
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


function requirePlatform(session) {
  return session.is_platform_user || session.access_level === "platform_owner" || session.access_level === "platform_admin";
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
  if(!requirePlatform(session)) return forbidden(); const input=await readJson(request); const name=clean(input.name),status=clean(input.status)||"active",plan=clean(input.subscriptionPlan)||"development";
  if(!name||!["active","suspended"].includes(status)) return json({error:{code:"VALIDATION_ERROR",message:"Enter a name and valid status."}},400);
  const r=await db.prepare("UPDATE organisations SET name=?,status=?,subscription_plan=?,suspended_at=CASE WHEN ?='suspended' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,status,plan,status,id).run();
  if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404); await audit(db,session.organisation_id,session.user_id,"platform.organisation_updated","organisation",id,{name,status,plan}); return json({ok:true});
}
async function switchOrganisation(request,db,session){
  if(!requirePlatform(session)) return forbidden(); const input=await readJson(request),orgId=clean(input.organisationId),branchId=clean(input.branchId)||null;
  const org=await db.prepare("SELECT id,name,status FROM organisations WHERE id=?").bind(orgId).first(); if(!org)return json({error:{code:"NOT_FOUND",message:"Organisation not found."}},404);
  if(branchId){const branch=await db.prepare("SELECT id FROM branches WHERE id=? AND organisation_id=? AND status='active'").bind(branchId,orgId).first();if(!branch)return json({error:{code:"INVALID_BRANCH",message:"Branch does not belong to this organisation."}},400);}
  await db.batch([db.prepare("UPDATE sessions SET organisation_id=?,active_branch_id=?,switched_by_platform_user=1,last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(orgId,branchId,session.session_id),auditStatement(db,orgId,session.user_id,"platform.organisation_switched","organisation",orgId,{from:session.organisation_id,branchId})]);
  return json({ok:true,organisation:org});
}
async function listBranches(db,session){const r=await db.prepare("SELECT * FROM branches WHERE organisation_id=? ORDER BY status,name COLLATE NOCASE").bind(session.organisation_id).all();return json({branches:r.results});}
async function createBranch(request,db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin"]))return forbidden();const i=await readJson(request),name=clean(i.name);if(!name)return json({error:{code:"VALIDATION_ERROR",message:"Enter a branch name."}},400);const id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO branches(id,organisation_id,name,code,address,phone,email,status) VALUES(?,?,?,?,?,?,?,?)").bind(id,session.organisation_id,name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),"active"),auditStatement(db,session.organisation_id,session.user_id,"branch.created","branch",id,{name})]);return json({branch:{id,name,status:"active"}},201);}
async function updateBranch(request,db,session,id){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin"]))return forbidden();const i=await readJson(request),name=clean(i.name),status=clean(i.status)||"active";const r=await db.prepare("UPDATE branches SET name=?,code=?,address=?,phone=?,email=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name,clean(i.code),clean(i.address),clean(i.phone),clean(i.email),status,id,session.organisation_id).run();if(!r.meta.changes)return json({error:{code:"NOT_FOUND",message:"Branch not found."}},404);return json({ok:true});}
async function listFamilyAccess(db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const r=await db.prepare(`SELECT f.*,u.display_name,u.email,c.first_name,c.last_name FROM family_client_access f JOIN users u ON u.id=f.user_id JOIN clients c ON c.id=f.client_id WHERE f.organisation_id=? ORDER BY u.display_name`).bind(session.organisation_id).all();return json({links:r.results});}
async function saveFamilyAccess(request,db,session){if(!hasRole(session,["owner","manager","organisation_owner","organisation_admin","branch_manager"]))return forbidden();const i=await readJson(request),userId=clean(i.userId),clientId=clean(i.clientId);const user=await db.prepare("SELECT id FROM users WHERE id=? AND organisation_id=? AND access_level='family'").bind(userId,session.organisation_id).first(),client=await db.prepare("SELECT id FROM clients WHERE id=? AND organisation_id=?").bind(clientId,session.organisation_id).first();if(!user||!client)return json({error:{code:"VALIDATION_ERROR",message:"Choose a family user and client from this organisation."}},400);const id=crypto.randomUUID();await db.prepare(`INSERT INTO family_client_access(id,organisation_id,user_id,client_id,can_view_profile,can_view_visits,can_view_care_updates,can_view_documents,can_view_medication,status) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,client_id) DO UPDATE SET can_view_profile=excluded.can_view_profile,can_view_visits=excluded.can_view_visits,can_view_care_updates=excluded.can_view_care_updates,can_view_documents=excluded.can_view_documents,can_view_medication=excluded.can_view_medication,status='active'`).bind(id,session.organisation_id,userId,clientId,i.canViewProfile!==false?1:0,i.canViewVisits!==false?1:0,i.canViewCareUpdates!==false?1:0,i.canViewDocuments?1:0,i.canViewMedication?1:0,"active").run();return json({ok:true},201);}
