/** CoreCare Cloudflare Worker — v0.4.2 account administration */
const VERSION = "0.4.2";
const SESSION_COOKIE = "corecare_session";
const SESSION_HOURS = 12;
const PASSWORD_ITERATIONS = 120000;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 5;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return health(env);
      if (url.pathname === "/api/version") return json({ name: "CoreCare", version: VERSION, sprint: "Sprint 4C — account administration" });
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/session" && request.method === "GET") return sessionInfo(request, env);

      if (url.pathname.startsWith("/api/")) {
        if (!env.DB) return databaseRequired();
        const session = await requireSession(request, env.DB);
        if (session instanceof Response) return session;

        if (url.pathname === "/api/auth/change-password" && request.method === "POST") return changePassword(request, env.DB, session);
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

function health(env) { return json({ ok:true, service:"corecare", version:VERSION, database:Boolean(env.DB), authentication:Boolean(env.DB), timestamp:new Date().toISOString() }); }

async function login(request, env) {
  if (!env.DB) return databaseRequired("Authentication requires the D1 database binding named DB.");
  const input = await readJson(request), email = clean(input.email).toLowerCase(), password = String(input.password || "");
  if (!email || !password) return json({ error:{ code:"VALIDATION_ERROR", message:"Enter an email address and password." } },400);
  const ip = clean(request.headers.get("cf-connecting-ip")).slice(0,64) || "unknown";
  const attemptKey = await sha256Base64(`${email}|${ip}`);
  const attempt = await env.DB.prepare("SELECT attempt_count,window_started_at,locked_until FROM login_attempts WHERE attempt_key=?").bind(attemptKey).first();
  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) return json({ error:{ code:"ACCOUNT_TEMPORARILY_LOCKED",message:"Too many unsuccessful attempts. Try again in 15 minutes." } },429);

  const user = await env.DB.prepare(`SELECT u.id,u.organisation_id,u.email,u.display_name,u.role,u.status,u.password_hash,u.password_salt,u.password_iterations,u.must_change_password,o.name AS organisation_name FROM users u JOIN organisations o ON o.id=u.organisation_id WHERE lower(u.email)=lower(?) LIMIT 1`).bind(email).first();
  const valid = user && user.status === "active" && user.password_hash && user.password_salt ? await verifyPassword(password,user.password_salt,user.password_hash,user.password_iterations||100000) : false;
  if (!valid) {
    await recordFailedLogin(env.DB, attemptKey, email, ip, attempt);
    return json({ error:{ code:"INVALID_CREDENTIALS",message:"The email address or password is incorrect." } },401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key=?").bind(attemptKey).run();
  const token=randomToken(), tokenHash=await sha256Base64(token), expires=new Date(Date.now()+SESSION_HOURS*3600000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    env.DB.prepare("INSERT INTO sessions (id,user_id,organisation_id,token_hash,expires_at,user_agent,ip_hint) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,user.organisation_id,tokenHash,expires.toISOString(),clean(request.headers.get("user-agent")).slice(0,250),ip),
    env.DB.prepare("UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id),
    auditStatement(env.DB,user.organisation_id,user.id,"user.login","user",user.id,{email:user.email})
  ]);
  return json({ user:publicUser(user), expiresAt:expires.toISOString() },200,{"set-cookie":sessionCookie(token,expires)});
}

async function recordFailedLogin(db,key,email,ip,attempt){
  const now=Date.now(), windowStart=attempt?.window_started_at?new Date(attempt.window_started_at).getTime():0;
  const within=now-windowStart<LOGIN_WINDOW_MINUTES*60000;
  const count=within?(attempt?.attempt_count||0)+1:1;
  const lock=count>=MAX_LOGIN_ATTEMPTS?new Date(now+LOGIN_WINDOW_MINUTES*60000).toISOString():null;
  await db.prepare(`INSERT INTO login_attempts (attempt_key,email,ip_hint,attempt_count,window_started_at,locked_until,updated_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(attempt_key) DO UPDATE SET email=excluded.email,ip_hint=excluded.ip_hint,attempt_count=excluded.attempt_count,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until,updated_at=CURRENT_TIMESTAMP`).bind(key,email,ip,count,within?attempt.window_started_at:new Date(now).toISOString(),lock).run();
}

async function logout(request,env){ if(env.DB){const token=cookieValue(request,SESSION_COOKIE);if(token)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256Base64(token)).run();} return json({ok:true},200,{"set-cookie":expiredSessionCookie()}); }
async function sessionInfo(request,env){if(!env.DB)return databaseRequired();const s=await requireSession(request,env.DB);if(s instanceof Response)return s;return json({user:publicUser(s),expiresAt:s.expires_at});}
async function requireSession(request,db){const token=cookieValue(request,SESSION_COOKIE);if(!token)return unauthorised();const row=await db.prepare(`SELECT s.id AS session_id,s.expires_at,s.user_id,s.organisation_id,u.email,u.display_name,u.role,u.status,u.must_change_password,o.name AS organisation_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN organisations o ON o.id=s.organisation_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`).bind(await sha256Base64(token)).first();if(!row||row.status!=="active")return unauthorised();await db.prepare("UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.session_id).run();return row;}

async function changePassword(request,db,s){const input=await readJson(request),current=String(input.currentPassword||""),next=String(input.newPassword||"");if(next.length<12||!/[A-Z]/.test(next)||!/[a-z]/.test(next)||!/[0-9]/.test(next))return json({error:{code:"WEAK_PASSWORD",message:"Use at least 12 characters with upper-case, lower-case and a number."}},400);const user=await db.prepare("SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?").bind(s.user_id).first();if(!user||!await verifyPassword(current,user.password_salt,user.password_hash,user.password_iterations||100000))return json({error:{code:"CURRENT_PASSWORD_INCORRECT",message:"The current password is incorrect."}},400);const secured=await hashPassword(next);await db.batch([db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(secured.hash,secured.salt,PASSWORD_ITERATIONS,s.user_id),db.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(s.user_id,s.session_id),auditStatement(db,s.organisation_id,s.user_id,"user.password_changed","user",s.user_id,{})]);return json({ok:true});}

async function listUsers(db,s){if(!hasRole(s,["owner","manager","auditor"]))return forbidden();const result=await db.prepare("SELECT id,email,display_name,role,status,must_change_password,last_login_at,created_at FROM users WHERE organisation_id=? ORDER BY display_name COLLATE NOCASE").bind(s.organisation_id).all();return json({users:result.results.map(toUser)});}
async function createUser(request,db,s){if(!hasRole(s,["owner"]))return forbidden();const i=await readJson(request),email=clean(i.email).toLowerCase(),name=clean(i.displayName),role=clean(i.role),password=String(i.temporaryPassword||"");if(!email||!name||!allowedRoles().includes(role)||password.length<12)return json({error:{code:"VALIDATION_ERROR",message:"Enter a name, valid email, role and temporary password of at least 12 characters."}},400);const secured=await hashPassword(password),id=crypto.randomUUID();try{await db.batch([db.prepare("INSERT INTO users (id,organisation_id,email,display_name,role,password_hash,password_salt,password_iterations,status,must_change_password) VALUES (?,?,?,?,?,?,?,?, 'active',1)").bind(id,s.organisation_id,email,name,role,secured.hash,secured.salt,PASSWORD_ITERATIONS),auditStatement(db,s.organisation_id,s.user_id,"user.created","user",id,{email,role})]);}catch(e){if(String(e).toLowerCase().includes("unique"))return json({error:{code:"EMAIL_EXISTS",message:"A user with that email already exists."}},409);throw e;}return json({user:{id,email,displayName:name,role,status:"active",mustChangePassword:true,lastLoginAt:null}},201);}
async function updateUser(request,db,s,id){if(!hasRole(s,["owner"]))return forbidden();if(id===s.user_id)return json({error:{code:"SELF_ADMIN_BLOCKED",message:"Use the password screen to manage your own account. You cannot disable or change your own role here."}},400);const i=await readJson(request),name=clean(i.displayName),role=clean(i.role),status=clean(i.status);if(!name||!allowedRoles().includes(role)||!["active","disabled"].includes(status))return json({error:{code:"VALIDATION_ERROR",message:"Choose a valid name, role and account status."}},400);const result=await db.prepare("UPDATE users SET display_name=?,role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(name,role,status,id,s.organisation_id).run();if(!result.meta.changes)return json({error:{code:"USER_NOT_FOUND",message:"User account not found."}},404);if(status==="disabled")await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();await audit(db,s.organisation_id,s.user_id,"user.updated","user",id,{role,status});return json({ok:true});}
async function updateOrganisation(request,db,s){if(!hasRole(s,["owner"]))return forbidden();const i=await readJson(request),name=clean(i.name);if(name.length<2)return json({error:{code:"VALIDATION_ERROR",message:"Enter an organisation name."}},400);await db.batch([db.prepare("UPDATE organisations SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,s.organisation_id),auditStatement(db,s.organisation_id,s.user_id,"organisation.updated","organisation",s.organisation_id,{name})]);return json({organisation:{id:s.organisation_id,name}});}
async function listAudit(db,s,url){if(!hasRole(s,["owner","manager","auditor"]))return forbidden();const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||50));const result=await db.prepare(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.detail_json,a.created_at,u.display_name AS user_name,u.email AS user_email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.organisation_id=? ORDER BY a.created_at DESC LIMIT ?`).bind(s.organisation_id,limit).all();return json({events:result.results.map(r=>({...r,detail:safeJson(r.detail_json)}))});}

async function developmentStatus(env,s){const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();return json({version:VERSION,environment:"development",database:{connected:true,provider:"Cloudflare D1",tables:tables.results.map(r=>r.name)},authentication:{mode:"database session",sessionExpiresAt:s.expires_at},user:publicUser(s),deployment:{worker:"forget-me-not",checkedAt:new Date().toISOString()}});}
async function listClients(db,s){const r=await db.prepare("SELECT id,first_name,last_name,date_of_birth,nhs_number,town,care_package,next_review,status,risk FROM clients WHERE organisation_id=? ORDER BY last_name COLLATE NOCASE,first_name COLLATE NOCASE").bind(s.organisation_id).all();return json({clients:r.results.map(toClient)});}
async function createClient(request,db,s){if(!hasRole(s,["owner","manager","carer"]))return forbidden();const i=await readJson(request),v=validateClient(i);if(v)return json({error:{code:"VALIDATION_ERROR",message:v}},400);const id=crypto.randomUUID();await db.batch([db.prepare("INSERT INTO clients (id,organisation_id,first_name,last_name,date_of_birth,nhs_number,town,care_package,next_review,status,risk) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,s.organisation_id,clean(i.firstName),clean(i.lastName),i.dateOfBirth,clean(i.nhsNumber),clean(i.town),clean(i.carePackage),i.nextReview,i.status,i.risk),auditStatement(db,s.organisation_id,s.user_id,"client.created","client",id,{firstName:i.firstName,lastName:i.lastName})]);return json({client:{...normaliseClient(i),id}},201);}
async function updateClient(request,db,s,id){if(!hasRole(s,["owner","manager","carer"]))return forbidden();const i=await readJson(request),v=validateClient(i);if(v)return json({error:{code:"VALIDATION_ERROR",message:v}},400);const r=await db.prepare("UPDATE clients SET first_name=?,last_name=?,date_of_birth=?,nhs_number=?,town=?,care_package=?,next_review=?,status=?,risk=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organisation_id=?").bind(clean(i.firstName),clean(i.lastName),i.dateOfBirth,clean(i.nhsNumber),clean(i.town),clean(i.carePackage),i.nextReview,i.status,i.risk,id,s.organisation_id).run();if(!r.meta.changes)return json({error:{code:"CLIENT_NOT_FOUND",message:"Client record not found."}},404);await audit(db,s.organisation_id,s.user_id,"client.updated","client",id,{firstName:i.firstName,lastName:i.lastName});return json({client:{...normaliseClient(i),id}});}

function allowedRoles(){return["owner","manager","carer","auditor"]}function hasRole(s,a){return a.includes(s.role)}function forbidden(){return json({error:{code:"PERMISSION_DENIED",message:"You do not have permission to perform this action."}},403)}
function auditStatement(db,org,user,action,type,id,detail){return db.prepare("INSERT INTO audit_log (id,organisation_id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),org,user,action,type,id,JSON.stringify(detail))}async function audit(db,org,user,action,type,id,detail){await auditStatement(db,org,user,action,type,id,detail).run()}
function publicUser(r){return{id:r.user_id||r.id,email:r.email,displayName:r.display_name,role:r.role,organisationId:r.organisation_id,organisationName:r.organisation_name,mustChangePassword:Boolean(r.must_change_password)}}
function toUser(r){return{id:r.id,email:r.email,displayName:r.display_name,role:r.role,status:r.status,mustChangePassword:Boolean(r.must_change_password),lastLoginAt:r.last_login_at,createdAt:r.created_at}}
async function hashPassword(password){const salt=crypto.getRandomValues(new Uint8Array(16)),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:PASSWORD_ITERATIONS},key,256);return{salt:bytesToBase64(salt),hash:bytesToBase64(new Uint8Array(bits))}}
async function verifyPassword(password,saltB64,expectedB64,iterations){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:base64ToBytes(saltB64),iterations},key,256);return timingSafeEqual(new Uint8Array(bits),base64ToBytes(expectedB64))}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0}function bytesToBase64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}function base64ToBytes(v){return Uint8Array.from(atob(v),c=>c.charCodeAt(0))}async function sha256Base64(v){return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))))}function randomToken(){return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function cookieValue(req,name){const c=req.headers.get("cookie")||"";for(const p of c.split(";")){const[k,...v]=p.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return null}function sessionCookie(token,expires){return`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`}function expiredSessionCookie(){return`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
function unauthorised(){return json({error:{code:"AUTHENTICATION_REQUIRED",message:"Sign in to continue."}},401)}function databaseRequired(message="CoreCare is not connected to its database."){return json({error:{code:"DATABASE_NOT_CONFIGURED",message}},503)}function methodNotAllowed(allow){return json({error:{code:"METHOD_NOT_ALLOWED",message:"Method not allowed."}},405,{allow:allow.join(", ")})}
async function readJson(req){try{return await req.json()}catch{return{}}}function clean(v){return String(v??"").trim()}function safeJson(v){try{return JSON.parse(v||"{}") }catch{return{}}}
function validateClient(i){if(!clean(i.firstName)||!clean(i.lastName)||!clean(i.town)||!i.dateOfBirth||!i.nextReview)return"Complete all required client fields.";if(!["Active","Paused","Archived"].includes(i.status))return"Choose a valid client status.";if(!["Standard","Medium","High"].includes(i.risk))return"Choose a valid risk level.";return null}function normaliseClient(i){return{firstName:clean(i.firstName),lastName:clean(i.lastName),dateOfBirth:i.dateOfBirth,nhsNumber:clean(i.nhsNumber),town:clean(i.town),carePackage:clean(i.carePackage),nextReview:i.nextReview,status:i.status,risk:i.risk}}function toClient(r){return{id:r.id,firstName:r.first_name,lastName:r.last_name,dateOfBirth:r.date_of_birth,nhsNumber:r.nhs_number||"",town:r.town,carePackage:r.care_package||"",nextReview:r.next_review,status:r.status,risk:r.risk}}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}})}
