import { workforceSetupStatements } from './workforce-seed.js';
import { organisationModuleSetupStatements } from './organisation-modules.js';

const PRODUCT_CODE = 'CARE';
const PASSWORD_ITERATIONS = 100000;
const clean = (value, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength);
const json = (payload, status = 200) => Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });

async function boundedJson(request,maxBytes=32_768){
  const declared=Number(request.headers.get('content-length'));if(Number.isFinite(declared)&&declared>maxBytes)return {};
  if(!request.body)return {};const reader=request.body.getReader(),chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes){await reader.cancel();return {};}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return {};}
}

function base64(bytes) { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
async function passwordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256));
  return { hash: base64(hash), salt: base64(salt) };
}

async function upsertInitialUser(env, organisation, branchId, input) {
  if (!input) return null;
  const email = clean(input.email, 320).toLowerCase(), name = clean(input.name, 240) || email, password = String(input.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) return { error: json({ error: { code: 'INVALID_INITIAL_USER', message: 'A valid owner email and secure password are required.' } }, 400) };
  const secured = await passwordRecord(password), existing = await env.DB.prepare('SELECT id FROM users WHERE organisation_id=?1 AND lower(email)=lower(?2) LIMIT 1').bind(organisation.id, email).first();
  if (existing) {
    await env.DB.prepare(`UPDATE users SET display_name=?1,role='owner',access_level='organisation_owner',home_branch_id=?2,password_hash=?3,password_salt=?4,password_iterations=?5,status='active',must_change_password=1,password_changed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?6`).bind(name, branchId, secured.hash, secured.salt, PASSWORD_ITERATIONS, existing.id).run();
    return { id: existing.id, email, created: false };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users(id,organisation_id,email,display_name,role,access_level,home_branch_id,password_hash,password_salt,password_iterations,status,must_change_password,password_changed_at) VALUES(?1,?2,?3,?4,'owner','organisation_owner',?5,?6,?7,?8,'active',1,NULL)`).bind(id, organisation.id, email, name, branchId, secured.hash, secured.salt, PASSWORD_ITERATIONS).run();
  return { id, email, created: true };
}

async function authorised(request, env) {
  const supplied = clean(request.headers.get('x-corecare-product-key'), 4_000);
  const expected = clean(env.CORECARE_PRODUCT_KEY, 4_000);
  if (!expected) return { error: json({ error: { code: 'PRODUCT_KEY_NOT_CONFIGURED', message: 'Care product control is not configured.' } }, 503) };
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(supplied)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const a = new Uint8Array(left); const b = new Uint8Array(right); let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0 && supplied ? { ok: true } : { error: json({ error: { code: 'INVALID_PRODUCT_CREDENTIALS', message: 'Product credentials are invalid.' } }, 401) };
}

async function careSummary(env, organisation) {
  const [branches, users, clients, staff, plans, tickets] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM branches WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM users WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM clients WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM staff WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) active FROM care_plans WHERE organisation_id=?1").bind(organisation.id).first(),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status NOT IN ('resolved','closed') THEN 1 ELSE 0 END) open FROM platform_support_tickets WHERE organisation_id=?1 AND product_id='product-care'").bind(organisation.id).first(),
  ]);
  return {
    productCode: PRODUCT_CODE,
    organisation: { id: organisation.id, externalId: organisation.id, name: organisation.name, status: organisation.status },
    metrics: {
      branches: Number(branches?.total || 0), activeBranches: Number(branches?.active || 0),
      users: Number(users?.total || 0), activeUsers: Number(users?.active || 0),
      clients: Number(clients?.total || 0), activeClients: Number(clients?.active || 0),
      staff: Number(staff?.total || 0), activeStaff: Number(staff?.active || 0),
      carePlans: Number(plans?.total || 0), activeCarePlans: Number(plans?.active || 0),
      supportTickets: Number(tickets?.total || 0), openSupportTickets: Number(tickets?.open || 0),
    },
  };
}

async function updateOrganisationLifecycle(request,env,requestedExternalId){
  const input=await boundedJson(request),status=clean(input.status,30).toLowerCase();
  if(!['active','suspended','archived'].includes(status))return json({error:{code:'INVALID_ORGANISATION_STATUS',message:'Choose active, suspended or archived.'}},400);
  const organisation=await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 LIMIT 1').bind(requestedExternalId).first();
  if(!organisation)return json({error:{code:'ORGANISATION_NOT_FOUND',message:'The Care organisation was not found.'}},404);
  const statements=[env.DB.prepare(`UPDATE organisations SET status=?1,suspended_at=CASE WHEN ?1='suspended' THEN COALESCE(suspended_at,CURRENT_TIMESTAMP) ELSE NULL END,archived_at=CASE WHEN ?1='archived' THEN COALESCE(archived_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?2`).bind(status,organisation.id)];
  if(status!=='active')statements.push(env.DB.prepare('UPDATE support_sessions SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP) WHERE organisation_id=?1 AND ended_at IS NULL').bind(organisation.id),env.DB.prepare('DELETE FROM sessions WHERE organisation_id=?1').bind(organisation.id));
  const results=await env.DB.batch(statements),revokedSessions=status==='active'?0:Number(results[1]?.meta?.changes||0)+Number(results[2]?.meta?.changes||0);
  return json({ok:true,protocol:'corecare-platform-organisation/1',organisation:{id:clean(input.platformOrganisationId,160)||organisation.id,external_id:organisation.id,name:organisation.name,status},revokedSessions});
}

export async function handlePlatformOrganisation(request, env, requestedExternalId = '') {
  const auth = await authorised(request, env); if (auth.error) return auth.error;
  if (!env.DB) return json({ error: { code: 'DATABASE_NOT_CONFIGURED', message: 'Care organisation storage is unavailable.' } }, 503);
  if (request.method === 'POST' && !requestedExternalId) {
    const input = await boundedJson(request); const source = input.organisation || {};
    const platformId = clean(source.id, 160); const externalId = clean(source.external_id || platformId, 160); const name = clean(source.name, 240);
    if (!platformId || !name) return json({ error: { code: 'INVALID_ORGANISATION', message: 'Organisation id and name are required.' } }, 400);
    let organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 OR id=?2 LIMIT 1').bind(platformId, externalId).first();
    if (!organisation) {
      const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'corecare-care'}-${platformId.slice(-8).toLowerCase()}`;
      await env.DB.prepare("INSERT INTO organisations(id,name,slug,status,subscription_plan) VALUES(?1,?2,?3,'active','development')").bind(platformId, name, slug).run();
    } else {
      await env.DB.prepare("UPDATE organisations SET name=?1,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?2").bind(name, organisation.id).run();
    }
    organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 OR id=?2 LIMIT 1').bind(platformId, externalId).first();
    const branch = await env.DB.prepare("SELECT id FROM branches WHERE organisation_id=?1 AND status='active' ORDER BY created_at LIMIT 1").bind(organisation.id).first();
    if (!branch) await env.DB.prepare("INSERT INTO branches(id,organisation_id,name,code,status) VALUES(?1,?2,'Main Branch','MAIN','active')").bind(`${organisation.id}-main`, organisation.id).run();
    const activeBranch = branch?.id || `${organisation.id}-main`;
    const initialUser = await upsertInitialUser(env, organisation, activeBranch, input.initialUser);
    if (initialUser?.error) return initialUser.error;
    await env.DB.batch([
      ...organisationModuleSetupStatements(env.DB, organisation.id, initialUser?.id || null),
      ...workforceSetupStatements(env.DB, organisation.id, initialUser?.id || null),
    ]);
    const productSummary = await careSummary(env, organisation);
    return json({ ok: true, protocol: 'corecare-platform-organisation/1', organisation: { id: platformId, external_id: organisation.id, name: organisation.name, status: organisation.status }, initialUser, summary: productSummary.metrics }, 201);
  }
  if (request.method === 'GET' && requestedExternalId) {
    const organisation = await env.DB.prepare('SELECT id,name,status FROM organisations WHERE id=?1 LIMIT 1').bind(requestedExternalId).first();
    if (!organisation) return json({ error: { code: 'ORGANISATION_NOT_FOUND', message: 'The Care organisation was not found.' } }, 404);
    return json({ ok: true, ...(await careSummary(env, organisation)) });
  }
  if(request.method==='PATCH'&&requestedExternalId)return updateOrganisationLifecycle(request,env,requestedExternalId);
  return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to provision, GET to inspect or PATCH to change organisation lifecycle.' } }, 405);
}
