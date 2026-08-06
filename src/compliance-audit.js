const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function clean(value, max = 240) { return String(value ?? '').trim().slice(0, max); }

async function sha256Base64(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sessionToken(request, response) {
  const requestMatch = request.headers.get('cookie')?.match(/(?:^|;\\s*)corecare_session=([^;]+)/i);
  if (requestMatch) return decodeURIComponent(requestMatch[1]);
  const responseMatch = response.headers.get('set-cookie')?.match(/(?:^|,\\s*)corecare_session=([^;,\\s]+)/i);
  return responseMatch ? decodeURIComponent(responseMatch[1]) : '';
}

async function actorFor(env, productCode, token) {
  if (!env.DB || !token || productCode === 'GARAGE') return { actorUserId: null, scopeId: null };
  const tokenHash = await sha256Base64(token);
  try {
    if (productCode === 'CAMPSITE') {
      const row = await env.DB.prepare("SELECT user_id,property_id scope_id FROM sessions WHERE token_hash=? AND datetime(expires_at)>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
      return { actorUserId: row?.user_id || null, scopeId: row?.scope_id || null };
    }
    if (productCode === 'POS') {
      const row = await env.DB.prepare("SELECT s.user_id,u.tenant_id scope_id FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
      return { actorUserId: row?.user_id || null, scopeId: row?.scope_id || null };
    }
    const row = await env.DB.prepare("SELECT user_id,organisation_id scope_id FROM sessions WHERE token_hash=? AND datetime(expires_at)>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
    return { actorUserId: row?.user_id || null, scopeId: row?.scope_id || null };
  } catch { return { actorUserId: null, scopeId: null }; }
}

export function protectResponse(response, request) {
  const headers = new Headers(response.headers);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if (new URL(request.url).pathname.startsWith('/api/')) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function recordComplianceMutation(request, env, response, productCode) {
  if (!env.DB || SAFE_METHODS.has(request.method)) return;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/platform-access') return;
  try {
    const actor = await actorFor(env, productCode, sessionToken(request, response));
    const requestId = clean(response.headers.get('x-request-id') || request.headers.get('cf-ray') || request.headers.get('x-request-id')) || crypto.randomUUID();
    const status = Number(response.status || 0);
    await env.DB.prepare(`INSERT INTO compliance_audit_events(id,product_code,scope_id,actor_user_id,http_method,route,status_code,outcome,request_id,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), productCode, actor.scopeId, actor.actorUserId, clean(request.method, 12), clean(url.pathname, 500), status, status < 400 ? 'succeeded' : status < 500 ? 'rejected' : 'failed', requestId, new Date().toISOString()).run();
  } catch {
    // Compliance evidence must not break the customer request while a migration is rolling out.
  }
}

export async function runTransientRetention(env) {
  if (!env.DB) return { deleted: 0 };
  let deleted = 0;
  for (const statement of [
    "DELETE FROM sessions WHERE datetime(expires_at) < datetime('now','-1 day')",
    "DELETE FROM login_attempts WHERE datetime(updated_at) < datetime('now','-1 day')",
    "DELETE FROM form_rate_limits WHERE datetime(updated_at) < datetime('now','-1 day')",
  ]) {
    try {
      const result = await env.DB.prepare(statement).run();
      deleted += Number(result.meta?.changes || 0);
    } catch {
      // Product schemas differ; a missing transient table is not a maintenance failure.
    }
  }
  return { deleted };
}
