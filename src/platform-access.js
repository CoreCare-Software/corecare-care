const PRODUCT_CODE = 'CARE';
const SESSION_COOKIE = 'corecare_session';
const SUPPORT_PRINCIPAL_ORGANISATION_ID = 'corecare-platform-support';
const SUPPORT_PRINCIPAL_BRANCH_ID = 'corecare-platform-support-main';

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

async function supportPrincipalKey(platformUser) {
  const source = String(platformUser?.id || platformUser?.email || '').trim().toLowerCase();
  if (!source) return '';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '').slice(0, 32);
}

async function resolvePlatformSupportUser(env, platformUser) {
  const email = String(platformUser?.email || '').trim().toLowerCase();
  const displayName = String(platformUser?.name || email || 'CoreCare Platform owner').trim().slice(0, 240);
  const key = await supportPrincipalKey(platformUser);
  if (!key || !email) return null;
  const userId = `platform-support-${key}`;
  const shadowEmail = `platform+${key}@access.corecare.internal`;
  const select = () => env.DB.prepare(`SELECT id,organisation_id,email,display_name,access_level,is_platform_user,home_branch_id,status
    FROM users WHERE is_platform_user=1 AND status='active' AND (id=?1 OR lower(email)=lower(?2) OR lower(email)=lower(?3)) LIMIT 1`)
    .bind(userId, shadowEmail, email).first();
  const existing = await select();
  if (existing) return existing;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organisations(id,name,slug,status,subscription_plan,lifecycle_stage)
      VALUES(?1,'CoreCare Platform support','corecare-platform-support','active','development','internal')
      ON CONFLICT(id) DO UPDATE SET status='active',updated_at=CURRENT_TIMESTAMP`).bind(SUPPORT_PRINCIPAL_ORGANISATION_ID),
    env.DB.prepare(`INSERT INTO branches(id,organisation_id,name,code,status)
      VALUES(?1,?2,'Platform Support','PLATFORM','active')
      ON CONFLICT(id) DO UPDATE SET status='active',updated_at=CURRENT_TIMESTAMP`).bind(SUPPORT_PRINCIPAL_BRANCH_ID, SUPPORT_PRINCIPAL_ORGANISATION_ID),
    env.DB.prepare(`INSERT INTO users(id,organisation_id,email,display_name,role,status,must_change_password,access_level,home_branch_id,is_platform_user)
      VALUES(?1,?2,?3,?4,'auditor','active',0,'platform_owner',?5,1)
      ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,status='active',must_change_password=0,
        access_level='platform_owner',home_branch_id=excluded.home_branch_id,is_platform_user=1,updated_at=CURRENT_TIMESTAMP`)
      .bind(userId, SUPPORT_PRINCIPAL_ORGANISATION_ID, shadowEmail, displayName, SUPPORT_PRINCIPAL_BRANCH_ID),
  ]);
  return select();
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

  const organisationId = result.organisation?.external_id || result.organisation?.id;
  if (result.protocol !== 'corecare-platform-access/1' || !organisationId || !result.platform_user?.email || !result.support_session?.id) {
    return json('Platform returned an invalid access session.', 502);
  }
  const organisation = await env.DB.prepare("SELECT id,name,status FROM organisations WHERE id=? AND status='active'").bind(organisationId).first();
  if (!organisation) return json('The linked Care organisation does not exist or is inactive.', 404);
  const user = await resolvePlatformSupportUser(env, result.platform_user);
  if (!user || (!user.is_platform_user && !['platform_owner', 'platform_admin'].includes(user.access_level))) return json('The Platform user could not be mapped into CoreCare Care.', 503);

  const token = randomToken();
  const sessionId = crypto.randomUUID();
  const expires = new Date(String(result.support_session.expires_at).replace(' ', 'T') + (String(result.support_session.expires_at).endsWith('Z') ? '' : 'Z'));
  if (!Number.isFinite(expires.getTime()) || expires <= new Date()) return json('The Platform support session has expired.', 410);
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sessions (id,user_id,organisation_id,active_branch_id,token_hash,expires_at,user_agent,ip_hint,switched_by_platform_user,support_mode,support_origin_organisation_id,support_started_at)
      VALUES (?,?,?,?,?,?,?,?,1,1,?,CURRENT_TIMESTAMP)`).bind(sessionId,user.id,organisation.id,user.home_branch_id,await tokenHash(token),expires.toISOString(),String(request.headers.get('user-agent')||'').slice(0,250),ip.slice(0,100),user.organisation_id),
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

export { platformOrigin, resolvePlatformSupportUser };
