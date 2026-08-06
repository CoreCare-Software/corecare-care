const clean = (value, max = 1_000) => String(value ?? '').trim().slice(0, max);

export function safeErrorMessage(error) {
  return clean(error?.message || error || 'Unknown server error')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(bearer|token|code|password|secret)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

export async function recordRuntimeError(env, input = {}) {
  const requestId = clean(input.requestId || crypto.randomUUID(), 160);
  const productCode = clean(input.productCode || 'UNKNOWN', 40).toUpperCase();
  const route = clean(input.route || '/', 500);
  const method = clean(input.method || 'UNKNOWN', 20).toUpperCase();
  const statusCode = Number(input.statusCode) || 500;
  const errorName = clean(input.error?.name || 'Error', 160);
  const errorMessage = safeErrorMessage(input.error);
  const organisationId = clean(input.organisationId, 160) || null;
  const userId = clean(input.userId, 160) || null;

  console.error(JSON.stringify({
    type: 'corecare.runtime.error', requestId, productCode, organisationId,
    userId, route, method, statusCode, errorName, errorMessage,
  }));

  if (!env?.DB) return false;
  try {
    await env.DB.prepare(`INSERT INTO api_error_log
      (id,request_id,product_code,organisation_id,user_id,route,method,status_code,error_name,error_message)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), requestId, productCode, organisationId, userId, route, method, statusCode, errorName, errorMessage).run();
    return true;
  } catch {
    try {
      await env.DB.prepare(`INSERT INTO api_error_log
        (id,organisation_id,user_id,route,method,error_message) VALUES(?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), organisationId, userId, route, method, `[${requestId}] ${errorMessage}`).run();
      return true;
    } catch {
      return false;
    }
  }
}

