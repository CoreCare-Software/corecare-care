const PRODUCT_CODE = 'CARE';
const DEFAULT_PRODUCT_VERSION = '1.33.0';
const RETRY_MINUTES = [5, 15, 60, 360, 1_440];

const clean = (value, maxLength = 1_000) => String(value ?? '').trim().slice(0, maxLength);
const stateDatabase = env => env.CONTROL_DB;

function platformOrigin(env) {
  try {
    const url = new URL(env.PLATFORM_ORIGIN || '');
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return url.protocol === 'https:' || local ? url.origin : '';
  } catch { return ''; }
}

function platformRequest(env, url, init) {
  const request = new Request(url, init);
  return env.CORECARE_PLATFORM?.fetch ? env.CORECARE_PLATFORM.fetch(request) : fetch(request);
}

function nextAttempt(attempt, now = new Date()) {
  const minutes = RETRY_MINUTES[Math.min(Math.max(Number(attempt || 1) - 1, 0), RETRY_MINUTES.length - 1)];
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function validateEntitlementContract(contract, organisation) {
  if (!contract || contract.protocol !== 'corecare-entitlements/1') throw new Error('Platform returned an unsupported entitlement protocol.');
  if (clean(contract.product?.code, 40).toUpperCase() !== PRODUCT_CODE) throw new Error('Platform returned entitlements for a different product.');
  const ids = new Set([clean(organisation.platform_organisation_id, 160), clean(organisation.external_organisation_id, 160)]);
  if (!ids.has(clean(contract.organisation?.id, 160)) && !ids.has(clean(contract.organisation?.externalId, 160))) throw new Error('Platform returned entitlements for a different organisation.');
  if (!clean(contract.version, 200) || !clean(contract.checksum, 500)) throw new Error('Platform entitlement version and checksum are required.');
  if (!contract.features || typeof contract.features !== 'object' || Array.isArray(contract.features)) throw new Error('Platform entitlement features are invalid.');
  const features = {};
  for (const [key, enabled] of Object.entries(contract.features)) {
    const featureKey = clean(key, 80);
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(featureKey) || typeof enabled !== 'boolean') throw new Error('Platform entitlement features are invalid.');
    features[featureKey] = enabled;
  }
  return { ...contract, features, details: Array.isArray(contract.details) ? contract.details.slice(0, 500) : [] };
}

async function acknowledge(env, organisation, contract, status, error = '') {
  const response = await platformRequest(env, `${platformOrigin(env)}/api/platform/entitlements/acknowledge`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-corecare-product-key': env.CORECARE_PRODUCT_KEY },
    body: JSON.stringify({ product_code: PRODUCT_CODE, organisation_id: organisation.platform_organisation_id,
      version: contract.version, checksum: contract.checksum, status,
      product_version: clean(env.APP_VERSION || DEFAULT_PRODUCT_VERSION, 80), ...(error ? { error: clean(error, 1_000) } : {}) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(clean(body.error?.message || `Platform acknowledgement returned HTTP ${response.status}`, 1_000));
  }
}

async function markFailure(env, organisation, message, attempt) {
  await stateDatabase(env).prepare(`INSERT INTO corecare_platform_entitlements
    (external_organisation_id,platform_organisation_id,sync_status,last_error,attempt_count,next_attempt_at,last_requested_at,updated_at)
    VALUES(?,?,'failed',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(external_organisation_id) DO UPDATE SET platform_organisation_id=excluded.platform_organisation_id,
      sync_status='failed',last_error=excluded.last_error,attempt_count=excluded.attempt_count,
      next_attempt_at=excluded.next_attempt_at,last_requested_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
    .bind(organisation.external_organisation_id, organisation.platform_organisation_id, clean(message, 1_000), attempt, nextAttempt(attempt)).run();
}

async function syncOrganisation(env, organisation) {
  const attempt = Number(organisation.attempt_count || 0) + 1;
  let contract;
  try {
    const response = await platformRequest(env, `${platformOrigin(env)}/api/platform/organisations/${encodeURIComponent(organisation.platform_organisation_id)}/products/${PRODUCT_CODE}/entitlements`, {
      method: 'GET', headers: { accept: 'application/json', 'x-corecare-product-key': env.CORECARE_PRODUCT_KEY },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(payload.error?.message || `Platform entitlement request returned HTTP ${response.status}`, 1_000));
    contract = validateEntitlementContract(payload, organisation);
    await stateDatabase(env).prepare(`INSERT INTO corecare_platform_entitlements
      (external_organisation_id,platform_organisation_id,contract_version,contract_checksum,features_json,details_json,sync_status,last_error,attempt_count,next_attempt_at,last_requested_at,applied_at,updated_at)
      VALUES(?,?,?,?,?,?,'applied_pending_ack',NULL,0,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(external_organisation_id) DO UPDATE SET platform_organisation_id=excluded.platform_organisation_id,
        contract_version=excluded.contract_version,contract_checksum=excluded.contract_checksum,
        features_json=excluded.features_json,details_json=excluded.details_json,sync_status='applied_pending_ack',
        last_error=NULL,attempt_count=0,next_attempt_at=NULL,last_requested_at=CURRENT_TIMESTAMP,
        applied_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
      .bind(organisation.external_organisation_id, organisation.platform_organisation_id, clean(contract.version, 200), clean(contract.checksum, 500), JSON.stringify(contract.features), JSON.stringify(contract.details)).run();
    await acknowledge(env, organisation, contract, 'applied');
    await stateDatabase(env).prepare(`UPDATE corecare_platform_entitlements SET sync_status='applied',acknowledged_at=CURRENT_TIMESTAMP,
      last_error=NULL,attempt_count=0,next_attempt_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE external_organisation_id=?`).bind(organisation.external_organisation_id).run();
    return { organisationId: organisation.external_organisation_id, status: 'applied', checksum: contract.checksum };
  } catch (error) {
    const message = clean(error?.message || error, 1_000) || 'Entitlement synchronisation failed.';
    if (contract) await acknowledge(env, organisation, contract, 'failed', message).catch(() => null);
    await markFailure(env, organisation, message, attempt);
    return { organisationId: organisation.external_organisation_id, status: 'failed', error: message };
  }
}

export async function syncPlatformEntitlements(env, { limit = 25 } = {}) {
  if (!env.DB || !stateDatabase(env) || !env.CORECARE_PRODUCT_KEY || !platformOrigin(env)) return { configured: false, attempted: 0, applied: 0, failed: 0 };
  const maximum = Math.max(1, Math.min(Number(limit) || 25, 100));
  const rows = await env.DB.prepare(`SELECT o.id external_organisation_id,o.id platform_organisation_id
    FROM organisations o WHERE o.status='active' ORDER BY o.created_at,o.id LIMIT ?`).bind(maximum).all();
  const results = [];
  for (const organisation of rows.results || []) {
    const state = await stateDatabase(env).prepare('SELECT attempt_count,next_attempt_at FROM corecare_platform_entitlements WHERE external_organisation_id=?').bind(organisation.external_organisation_id).first();
    if (state?.next_attempt_at && new Date(state.next_attempt_at) > new Date()) continue;
    results.push(await syncOrganisation(env, { ...organisation, attempt_count: Number(state?.attempt_count || 0) }));
  }
  return { configured: true, attempted: results.length, applied: results.filter(result => result.status === 'applied').length, failed: results.filter(result => result.status === 'failed').length, results };
}

export async function appliedEntitlements(db, externalOrganisationId) {
  const row = await db.prepare(`SELECT contract_version,contract_checksum,features_json,details_json,sync_status,applied_at,acknowledged_at
    FROM corecare_platform_entitlements WHERE external_organisation_id=? AND applied_at IS NOT NULL`).bind(externalOrganisationId).first();
  if (!row) return null;
  try { return { ...row, features: JSON.parse(row.features_json || '{}'), details: JSON.parse(row.details_json || '[]') }; } catch { return null; }
}

export async function featureEnabled(db, externalOrganisationId, featureKey, defaultValue = false) {
  const contract = await appliedEntitlements(db, externalOrganisationId);
  return contract && typeof contract.features?.[featureKey] === 'boolean' ? contract.features[featureKey] : defaultValue;
}

export { nextAttempt, platformOrigin };
