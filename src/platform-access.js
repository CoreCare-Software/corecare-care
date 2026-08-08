const PRODUCT_CODE = 'CARE';
const SESSION_COOKIE = 'corecare_session';
export const PLATFORM_SUPPORT_EMAIL = 'platform-support@internal.corecare.invalid';
const PLATFORM_SUPPORT_NAME = 'CoreCare Platform Support';

function json(error, status) {
  return Response.json({ error: { code: 'PLATFORM_ACCESS_FAILED', message: error } }, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function platformOrigin(env) {
  try {
    const url = new URL(env.PLATFORM_ORIGIN || '');
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.origin;
  } catch {}
  return '';
}

export function isPlatformSupportPrincipal(session) {
  return String(session?.email || '').toLowerCase() === PLATFORM_SUPPORT_EMAIL;
}

export function supportMutationDenied(request, session, url = new URL(request.url)) {
  return Boolean(session?.support_mode
    && session.support_access_mode === 'read_only'
    && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    && url.pathname !== '/api/platform/exit-support');
}

async function resolveSupportPrincipal(env, organisation, platformUser) {
  const branch = await env.DB.prepare("SELECT id FROM branches WHERE organisation_id=? AND status='active' ORDER BY created_at,id LIMIT 1").bind(organisation.id).first();
  if (!branch) return { error: json('The linked Care organisation has no active branch.', 404) };

  const existing = await env.DB.prepare("SELECT id,organisation_id,email,display_name,access_level,is_platform_user,home_branch_id,status FROM users WHERE organisation_id=? AND lower(email)=lower(?) AND status='active' LIMIT 1").bind(organisation.id, platformUser.email).first();
  if (existing && (existing.is_platform_user || ['platform_owner', 'platform_admin'].includes(existing.access_level))) {
    return { user: { ...existing, home_branch_id: branch.id }, branchId: branch.id };
  }

  const principalId = crypto.randomUUID();
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO users(id,organisation_id,email,display_name,role,access_level,is_platform_user,home_branch_id,password_hash,password_salt,status,must_change_password)
    VALUES(?,?,?,?,'auditor','platform_admin',1,?,NULL,NULL,'active',0)`).bind(principalId, organisation.id, PLATFORM_SUPPORT_EMAIL, PLATFORM_SUPPORT_NAME, branch.id).run();
  await env.DB.prepare(`UPDATE users SET display_name=?,role='auditor',access_level='platform_admin',is_platform_user=1,home_branch_id=?,password_hash=NULL,password_salt=NULL,status='active',must_change_password=0,updated_at=CURRENT_TIMESTAMP
    WHERE organisation_id=? AND email=?`).bind(PLATFORM_SUPPORT_NAME, branch.id, organisation.id, PLATFORM_SUPPORT_EMAIL).run();
  const user = await env.DB.prepare("SELECT id,organisation_id,email,display_name,access_level,is_platform_user,home_branch_id,status FROM users WHERE organisation_id=? AND email=? AND status='active' LIMIT 1").bind(organisation.id, PLATFORM_SUPPORT_EMAIL).first();
  if (!user) return { error: json('The Platform support principal could not be established.', 503) };
  if (Number(inserted.meta?.changes || 0) === 1) {
    await env.DB.prepare('INSERT INTO audit_log(id,organisation_id,user_id,action,entity_type,entity_id,detail_json) VALUES(?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), organisation.id, user.id, 'platform.support_principal_provisioned', 'user', user.id, JSON.stringify({ branchId: branch.id, loginEnabled: false })).run();
  }
  return { user, branchId: branch.id };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function exchangePlatformAccess(request, env) {
  if (!env.DB) return json('D1 database access is required.', 503);
  const url = new URL(request.url);
  const origin = platformOrigin(env);
  const code = url.searchParams.get('code') || '';
  if (!origin || !env.CORECARE_PRODUCT_KEY) return json('Platform access is not configured for CoreCare Care.', 503);
  if (!code || url.searchParams.get('platform_origin') !== origin) return json('The Platform access request is invalid.', 400);

  const exchangeUrl = `${origin}/api/platform/access/exchange`;
  const exchangeInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-corecare-product-key': env.CORECARE_PRODUCT_KEY },
    body: JSON.stringify({ code, product_code: PRODUCT_CODE }),
  };
  const exchange = env.CORECARE_PLATFORM?.fetch ? await env.CORECARE_PLATFORM.fetch(new Request(exchangeUrl,exchangeInit)) : await fetch(exchangeUrl,exchangeInit);
  const result = await exchange.json().catch(() => ({}));
  if (!exchange.ok) return json(result.error?.message || 'Platform rejected the access request.', exchange.status);

  const organisationId = result.organisation.external_id || result.organisation.id;
  if (result.protocol !== 'corecare-platform-access/1') return json('Platform returned an unsupported access protocol.', 502);
  const organisation = await env.DB.prepare("SELECT id,name,status FROM organisations WHERE id=? AND status='active'").bind(organisationId).first();
  if (!organisation) return json('The linked Care organisation does not exist or is inactive.', 404);
  const resolved = await resolveSupportPrincipal(env, organisation, result.platform_user);
  if (resolved.error) return resolved.error;
  const { user, branchId } = resolved;

  const token = randomToken();
  const sessionId = crypto.randomUUID();
  const expires = new Date(String(result.support_session.expires_at).replace(' ', 'T') + (String(result.support_session.expires_at).endsWith('Z') ? '' : 'Z'));
  if (!Number.isFinite(expires.getTime()) || expires <= new Date()) return json('The Platform support session has expired.', 410);
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (id,user_id,organisation_id,active_branch_id,token_hash,expires_at,user_agent,ip_hint,switched_by_platform_user,support_mode,support_origin_organisation_id,support_started_at)
      VALUES (?,?,?,?,?,?,?,?,1,1,?,CURRENT_TIMESTAMP)`).bind(sessionId,user.id,organisation.id,branchId,await tokenHash(token),expires.toISOString(),String(request.headers.get('user-agent')||'').slice(0,250),ip.slice(0,100),user.organisation_id),
    env.DB.prepare('INSERT INTO support_sessions(id,organisation_id,platform_user_id,reason,access_mode,session_id) VALUES(?,?,?,?,?,?)').bind(result.support_session.id,organisation.id,user.id,result.support_session.reason,result.support_session.access_mode,sessionId),
    env.DB.prepare('INSERT INTO audit_log(id,organisation_id,user_id,action,entity_type,entity_id,detail_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),organisation.id,user.id,'platform.cross_product_access','support_session',result.support_session.id,JSON.stringify({productCode:PRODUCT_CODE,accessMode:result.support_session.access_mode,reason:result.support_session.reason})),
  ]);
  return new Response(null, {
    status: 302,
    headers: {
      location: '/?platform_access=success',
      'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`,
      'cache-control': 'no-store',
    },
  });
}

export { platformOrigin };
