async function readInput(request, maxBytes = 16_384) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('The AI rewrite request is too large.'), { status: 413 });
  if (!request.body) return {};
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw Object.assign(new Error('The AI rewrite request is too large.'), { status: 413 }); }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { throw Object.assign(new Error('The AI rewrite request is not valid JSON.'), { status: 400 }); }
}

const response = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff' } });

export async function handleAiRewrite(request, env, identity, productKey) {
  if (request.method !== 'POST') return response({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for AI rewrite.' } }, 405);
  if (!identity?.organisationId || !identity?.userId) return response({ ok: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Sign in to use AI rewrite.' } }, 401);
  if (!env.CORECARE_AI?.rewrite) return response({ ok: false, error: { code: 'AI_NOT_CONFIGURED', message: 'AI rewrite is not available right now.' } }, 503);
  try {
    const input = await readInput(request);
    const result = await env.CORECARE_AI.rewrite({ ...input, productKey, organisationId: identity.organisationId, userId: identity.userId });
    const { status = result?.ok ? 200 : 503, ...payload } = result || {};
    return response(payload, status);
  } catch (error) {
    const status = Number(error?.status || 503);
    return response({ ok: false, error: { code: status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'INVALID_REQUEST' : 'AI_UNAVAILABLE', message: status < 500 ? error.message : 'AI rewrite is temporarily unavailable. Your original text has not changed.' } }, status);
  }
}
