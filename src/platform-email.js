const PRODUCT_CODE = 'CARE';
const clean = (value, maxLength = 500) => String(value ?? '').trim().slice(0, maxLength);

export function buildPlatformEmailPayload(input = {}) {
  return {
    product_code: PRODUCT_CODE,
    organisation_id: clean(input.organisationId, 160),
    template_key: clean(input.templateKey, 80),
    source_event_id: clean(input.sourceEventId, 240),
    recipient_email: clean(input.recipientEmail, 320).toLowerCase(),
    recipient_name: clean(input.recipientName, 240),
    access_label: clean(input.accessLabel, 120),
    ...(input.temporaryPassword ? { temporary_password: String(input.temporaryPassword) } : {}),
    ...(input.actionTime ? { action_time: clean(input.actionTime, 80) } : {}),
  };
}

export async function requestPlatformTransactionalEmail(env, input) {
  if (!env.CORECARE_PLATFORM?.fetch || !clean(env.CORECARE_PRODUCT_KEY, 4_000)) {
    return { ok: false, status: 'not_configured', error: 'CoreCare Platform email delivery is not configured.' };
  }
  const payload = buildPlatformEmailPayload(input);
  try {
    const response = await env.CORECARE_PLATFORM.fetch(new Request('https://corecare-platform.internal/api/platform/transactional-email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-corecare-product-key': clean(env.CORECARE_PRODUCT_KEY, 4_000),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    }));
    const result = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) return { ok: false, status: 'failed', error: clean(result.error?.message || result.error || `CoreCare Platform returned HTTP ${response.status}.`, 1_000) };
    return { ok: Boolean(result.ok), status: clean(result.status, 80) || (result.ok ? 'sent' : 'failed'), delivery: result.delivery || null, duplicate: Boolean(result.duplicate), error: clean(result.error, 1_000) || null };
  } catch (error) {
    return { ok: false, status: 'failed', error: clean(error?.message || error, 1_000) || 'CoreCare Platform email delivery failed.' };
  }
}
