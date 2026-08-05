const PRODUCT_CODE = 'CARE';
const DEFAULT_PRODUCT_VERSION = '1.37.0';
const RETRY_MINUTES = [5, 15, 60, 360, 1_440];
const ENTITLEMENT_MAX_AGE_MS = 15 * 60_000;

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
  const mode=clean(contract.access?.mode,20),subscriptionStatus=clean(contract.access?.subscriptionStatus||contract.subscription?.status,30);
  if(!['full','read_only','locked'].includes(mode)||!subscriptionStatus)throw new Error('Platform subscription access is invalid.');
  const access={mode,reason:clean(contract.access?.reason,80)||'subscription_required',billingRequired:Boolean(contract.access?.billingRequired),subscriptionStatus,trialEndsAt:clean(contract.access?.trialEndsAt,40)||null};
  const subscription=contract.subscription&&typeof contract.subscription==='object'?contract.subscription:{};
  const rawLimits=subscription.limits;
  if(!rawLimits||typeof rawLimits!=='object'||Array.isArray(rawLimits))throw new Error('Platform subscription limits are invalid.');
  const limits={};
  for(const resource of ['users','clients']){
    const value=rawLimits[resource];
    if(value===null){limits[resource]=null;continue;}
    if(!Number.isInteger(value)||value<0)throw new Error('Platform subscription limits are invalid.');
    limits[resource]=value;
  }
  subscription.limits=limits;
  return { ...contract, access, subscription, features, details: Array.isArray(contract.details) ? contract.details.slice(0, 500) : [] };
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
      (external_organisation_id,platform_organisation_id,contract_version,contract_checksum,features_json,details_json,access_json,subscription_json,sync_status,last_error,attempt_count,next_attempt_at,last_requested_at,applied_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,'applied_pending_ack',NULL,0,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(external_organisation_id) DO UPDATE SET platform_organisation_id=excluded.platform_organisation_id,
        contract_version=excluded.contract_version,contract_checksum=excluded.contract_checksum,
        features_json=excluded.features_json,details_json=excluded.details_json,access_json=excluded.access_json,subscription_json=excluded.subscription_json,sync_status='applied_pending_ack',
        last_error=NULL,attempt_count=0,next_attempt_at=NULL,last_requested_at=CURRENT_TIMESTAMP,
        applied_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
      .bind(organisation.external_organisation_id, organisation.platform_organisation_id, clean(contract.version, 200), clean(contract.checksum, 500), JSON.stringify(contract.features), JSON.stringify(contract.details), JSON.stringify(contract.access), JSON.stringify(contract.subscription)).run();
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

export async function syncPlatformEntitlements(env, { limit = 25, force = false } = {}) {
  if (!env.DB || !stateDatabase(env) || !env.CORECARE_PRODUCT_KEY || !platformOrigin(env)) return { configured: false, attempted: 0, applied: 0, failed: 0 };
  const maximum = Math.max(1, Math.min(Number(limit) || 25, 100));
  const rows = await env.DB.prepare(`SELECT o.id external_organisation_id,o.id platform_organisation_id
    FROM organisations o WHERE o.status='active' ORDER BY o.created_at,o.id LIMIT ?`).bind(maximum).all();
  const results = [];
  for (const organisation of rows.results || []) {
    const state = await stateDatabase(env).prepare('SELECT attempt_count,next_attempt_at FROM corecare_platform_entitlements WHERE external_organisation_id=?').bind(organisation.external_organisation_id).first();
    if (!force && state?.next_attempt_at && new Date(state.next_attempt_at) > new Date()) continue;
    results.push(await syncOrganisation(env, { ...organisation, attempt_count: Number(state?.attempt_count || 0) }));
  }
  return { configured: true, attempted: results.length, applied: results.filter(result => result.status === 'applied').length, failed: results.filter(result => result.status === 'failed').length, results };
}

export async function appliedEntitlements(db, externalOrganisationId) {
  const row = await db.prepare(`SELECT contract_version,contract_checksum,features_json,details_json,access_json,subscription_json,sync_status,applied_at,acknowledged_at,updated_at
    FROM corecare_platform_entitlements WHERE external_organisation_id=? AND applied_at IS NOT NULL`).bind(externalOrganisationId).first();
  if (!row) return null;
  try { return { ...row, features: JSON.parse(row.features_json || '{}'), details: JSON.parse(row.details_json || '[]'), access: JSON.parse(row.access_json || '{}'), subscription: JSON.parse(row.subscription_json || '{}') }; } catch { return null; }
}

function lockedAccess(reason, subscriptionStatus = 'unknown', trialEndsAt = null, updatedAt = null) {
  return { mode: 'locked', reason, billingRequired: true, subscriptionStatus, trialEndsAt, updatedAt };
}

export function effectiveSubscriptionAccess(access, updatedAt = null, nowMs = Date.now()) {
  const mode = clean(access?.mode, 20);
  const subscriptionStatus = clean(access?.subscriptionStatus, 30).toLowerCase() || 'unknown';
  const trialEndsAt = clean(access?.trialEndsAt, 40) || null;
  if (!['full', 'read_only', 'locked'].includes(mode)) return lockedAccess('entitlement_unavailable');
  const resolved = { ...access, mode, billingRequired: Boolean(access.billingRequired), subscriptionStatus, trialEndsAt, updatedAt: updatedAt || null };
  if (mode === 'locked') return resolved;
  if (subscriptionStatus === 'trial') {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trialEndsAt || '');
    const trialEnd = new Date(dateOnly ? `${trialEndsAt}T23:59:59.999Z` : trialEndsAt || '');
    if (!trialEndsAt || !Number.isFinite(trialEnd.getTime())) return lockedAccess('trial_expiry_unavailable', 'trial', trialEndsAt, updatedAt || null);
    if (trialEnd.getTime() <= nowMs) return lockedAccess('trial_expired', 'expired', trialEndsAt, updatedAt || null);
  }
  if (mode === 'full' && !['active', 'trial'].includes(subscriptionStatus)) return lockedAccess('subscription_required', subscriptionStatus, trialEndsAt, updatedAt || null);
  const updatedText = clean(updatedAt, 40);
  const refreshedAt = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(updatedText) ? `${updatedText.replace(' ', 'T')}Z` : updatedText).getTime();
  if (!Number.isFinite(refreshedAt) || nowMs - refreshedAt > ENTITLEMENT_MAX_AGE_MS || refreshedAt - nowMs > 5 * 60_000) return lockedAccess('entitlement_stale', subscriptionStatus, trialEndsAt, updatedAt || null);
  return resolved;
}

export async function subscriptionAccess(db, externalOrganisationId) { const contract=await appliedEntitlements(db,externalOrganisationId); return effectiveSubscriptionAccess(contract?.access,contract?.updated_at); }

export async function subscriptionLimit(db,externalOrganisationId,resource){
  if(!['users','clients'].includes(resource))throw new TypeError('Unsupported subscription limit resource.');
  const contract=await appliedEntitlements(db,externalOrganisationId),value=contract?.subscription?.limits?.[resource];
  return value===null?null:(Number.isInteger(value)&&value>=0?value:null);
}

export async function featureEnabled(db, externalOrganisationId, featureKey, defaultValue = false) {
  const contract = await appliedEntitlements(db, externalOrganisationId);
  return contract && typeof contract.features?.[featureKey] === 'boolean' ? contract.features[featureKey] : defaultValue;
}

export { nextAttempt, platformOrigin };
