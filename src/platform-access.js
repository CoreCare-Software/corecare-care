const PRODUCT_CODE = 'CARE';
const SESSION_COOKIE = 'corecare_session';

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
  const [organisation, user] = await Promise.all([
    env.DB.prepare("SELECT id,name,status FROM organisations WHERE id=? AND status='active'").bind(organisationId).first(),
    env.DB.prepare("SELECT id,organisation_id,email,display_name,access_level,is_platform_user,home_branch_id,status FROM users WHERE lower(email)=lower(?) AND status='active' LIMIT 1").bind(result.platform_user.email).first(),
  ]);
  if (!organisation) return json('The linked Care organisation does not exist or is inactive.', 404);
  if (!user || (!user.is_platform_user && !['platform_owner', 'platform_admin'].includes(user.access_level))) return json('The Platform user is not authorised in CoreCare Care.', 403);

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

export { platformOrigin };
