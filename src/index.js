/** CoreCare Cloudflare Worker — v0.4.1 authentication foundation */
const VERSION = "0.4.1";
const SESSION_COOKIE = "corecare_session";
const SESSION_HOURS = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return health(env);
      if (url.pathname === "/api/version") return json({ name: "CoreCare", version: VERSION, sprint: "Sprint 4B — authentication and organisations" });
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/session" && request.method === "GET") return sessionInfo(request, env);

      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return databaseRequired();
        const session = await requireSession(request, env.DB);
        if (session instanceof Response) return session;

        if (url.pathname === "/api/development/status") return developmentStatus(env, session);
        if (url.pathname === "/api/clients") {
          if (request.method === "GET") return listClients(env.DB, session);
          if (request.method === "POST") return createClient(request, env.DB, session);
          return methodNotAllowed(["GET", "POST"]);
        }
        const clientMatch = url.pathname.match(/^\/api\/clients\/([^/]+)$/);
        if (clientMatch) {
          if (request.method === "PUT") return updateClient(request, env.DB, session, decodeURIComponent(clientMatch[1]));
          return methodNotAllowed(["PUT"]);
        }
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

  const user = await env.DB.prepare(`
    SELECT u.id, u.organisation_id, u.email, u.display_name, u.role, u.status,
           u.password_hash, u.password_salt, u.password_iterations, o.name AS organisation_name
    FROM users u JOIN organisations o ON o.id = u.organisation_id
    WHERE lower(u.email) = lower(?) LIMIT 1
  `).bind(email).first();

  const valid = user && user.status === "active" && user.password_hash && user.password_salt
    ? await verifyPassword(password, user.password_salt, user.password_hash, user.password_iterations || 100000)
    : false;
  if (!valid) return json({ error: { code: "INVALID_CREDENTIALS", message: "The email address or password is incorrect." } }, 401);

  const token = randomToken();
  const tokenHash = await sha256Base64(token);
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.DB.prepare(`INSERT INTO sessions (id,user_id,organisation_id,token_hash,expires_at,user_agent,ip_hint) VALUES (?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), user.id, user.organisation_id, tokenHash, expires.toISOString(), clean(request.headers.get("user-agent")).slice(0,250), clean(request.headers.get("cf-connecting-ip")).slice(0,64)),
    env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id),
    auditStatement(env.DB, user.organisation_id, user.id, "user.login", "user", user.id, { email: user.email })
  ]);

  return json({ user: publicUser(user), expiresAt: expires.toISOString() }, 200, { "set-cookie": sessionCookie(token, expires) });
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
  const row = await db.prepare(`
    SELECT s.id AS session_id,s.expires_at,s.user_id,s.organisation_id,
           u.email,u.display_name,u.role,u.status,o.name AS organisation_name
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN organisations o ON o.id=s.organisation_id
    WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP LIMIT 1
  `).bind(await sha256Base64(token)).first();
  if (!row || row.status !== "active") return unauthorised();
  await db.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.session_id).run();
  return row;
}

async function developmentStatus(env, session) {
  const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  return json({
    version: VERSION,
    environment: "development",
    database: { connected: true, provider: "Cloudflare D1", tables: tables.results.map(r => r.name) },
    authentication: { mode: "database session", sessionExpiresAt: session.expires_at },
    user: publicUser(session),
    deployment: { worker: "forget-me-not", checkedAt: new Date().toISOString() }
  });
}

async function listClients(db, session) {
  const result = await db.prepare(`SELECT id,first_name,last_name,date_of_birth,nhs_number,town,care_package,next_review,status,risk FROM clients WHERE organisation_id=? ORDER BY last_name COLLATE NOCASE,first_name COLLATE NOCASE`).bind(session.organisation_id).all();
  return json({ clients: result.results.map(toClient) });
}

async function createClient(request, db, session) {
  if (!hasRole(session, ["owner", "manager", "carer"])) return forbidden();
  const input = await readJson(request); const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO clients (id,organisation_id,first_name,last_name,date_of_birth,nhs_number,town,care_package,next_review,status,risk) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,session.organisation_id,clean(input.firstName),clean(input.lastName),input.dateOfBirth,clean(input.nhsNumber),clean(input.town),clean(input.carePackage),input.nextReview,input.status,input.risk),
    auditStatement(db,session.organisation_id,session.user_id,"client.created","client",id,{ firstName: input.firstName,lastName: input.lastName })
  ]);
  return json({ client: { ...normaliseClient(input), id } }, 201);
}

async function updateClient(request, db, session, id) {
  if (!hasRole(session, ["owner", "manager", "carer"])) return forbidden();
  const input = await readJson(request); const validation = validateClient(input);
  if (validation) return json({ error: { code: "VALIDATION_ERROR", message: validation } }, 400);
  const result = await db.prepare(`UPDATE clients SET first_name=?,last_name=?,date_of_birth=?,nhs_number=?,town=?,care_package=?,next_review=?,status=?,risk=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?`).bind(clean(input.firstName),clean(input.lastName),input.dateOfBirth,clean(input.nhsNumber),clean(input.town),clean(input.carePackage),input.nextReview,input.status,input.risk,id,session.organisation_id).run();
  if (!result.meta.changes) return json({ error: { code: "CLIENT_NOT_FOUND", message: "Client record not found." } }, 404);
  await audit(db,session.organisation_id,session.user_id,"client.updated","client",id,{ firstName: input.firstName,lastName: input.lastName });
  return json({ client: { ...normaliseClient(input), id } });
}

function hasRole(session, allowed) { return allowed.includes(session.role); }
function forbidden(){ return json({ error:{ code:"PERMISSION_DENIED",message:"You do not have permission to perform this action." } },403); }
function auditStatement(db, organisationId, userId, action, entityType, entityId, detail) { return db.prepare(`INSERT INTO audit_log (id,organisation_id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),organisationId,userId,action,entityType,entityId,JSON.stringify(detail)); }
async function audit(db, organisationId, userId, action, entityType, entityId, detail) { await auditStatement(db,organisationId,userId,action,entityType,entityId,detail).run(); }
function publicUser(row) { return { id: row.user_id || row.id, email: row.email, displayName: row.display_name, role: row.role, organisationId: row.organisation_id, organisationName: row.organisation_name }; }

async function verifyPassword(password, saltB64, expectedB64, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt:base64ToBytes(saltB64), iterations }, key, 256);
  return timingSafeEqual(new Uint8Array(bits), base64ToBytes(expectedB64));
}
function timingSafeEqual(a,b){ if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0; }
function randomToken(){ const bytes=crypto.getRandomValues(new Uint8Array(32)); return bytesToBase64Url(bytes); }
async function sha256Base64(value){ const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return bytesToBase64(new Uint8Array(digest)); }
function base64ToBytes(value){ return Uint8Array.from(atob(value),c=>c.charCodeAt(0)); }
function bytesToBase64(bytes){ let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s); }
function bytesToBase64Url(bytes){ return bytesToBase64(bytes).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
function cookieValue(request,name){ const header=request.headers.get("cookie")||"";for(const item of header.split(";")){const [key,...rest]=item.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="));}return ""; }
function sessionCookie(token,expires){ return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`; }
function expiredSessionCookie(){ return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
function unauthorised(){ return json({ error:{ code:"UNAUTHENTICATED",message:"Your session has expired. Sign in again." } },401,{"set-cookie":expiredSessionCookie()}); }
function validateClient(input){ if(!input||typeof input!=="object")return"A valid client record is required.";for(const field of ["firstName","lastName","dateOfBirth","town","nextReview","status","risk"]){if(!String(input[field]??"").trim())return`The ${field} field is required.`;}if(!["Active","Paused","Archived"].includes(input.status))return"Invalid client status.";if(!["Standard","Medium","High"].includes(input.risk))return"Invalid risk level.";return null; }
function normaliseClient(input){ return { firstName:clean(input.firstName),lastName:clean(input.lastName),dateOfBirth:input.dateOfBirth,nhsNumber:clean(input.nhsNumber),town:clean(input.town),carePackage:clean(input.carePackage),nextReview:input.nextReview,status:input.status,risk:input.risk }; }
function toClient(row){ return { id:row.id,firstName:row.first_name,lastName:row.last_name,dateOfBirth:row.date_of_birth,nhsNumber:row.nhs_number||"",town:row.town,carePackage:row.care_package||"",nextReview:row.next_review,status:row.status,risk:row.risk }; }
async function readJson(request){ const type=request.headers.get("content-type")||"";if(!type.includes("application/json"))throw new Error("Expected application/json");return request.json(); }
function clean(value){ return String(value??"").trim().slice(0,500); }
function databaseRequired(message="Add the Cloudflare D1 binding named DB and run both migrations."){ return json({ error:{ code:"DATABASE_NOT_CONFIGURED",message } },503); }
function methodNotAllowed(allow){ return new Response(null,{status:405,headers:{Allow:allow.join(", ")}}); }
function json(body,status=200,extraHeaders={}){ return new Response(JSON.stringify(body,null,2),{status,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"same-origin","permissions-policy":"camera=(), microphone=(), geolocation=()","content-security-policy":"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",...extraHeaders}}); }
