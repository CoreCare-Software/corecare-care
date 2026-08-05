import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { effectiveSubscriptionAccess, nextAttempt, validateEntitlementContract } from '../src/platform-entitlements.js';

const organisation = { platform_organisation_id: 'org-1', external_organisation_id: 'org-1' };

test('validates a Care entitlement contract and rejects cross-product state', () => {
  const contract = validateEntitlementContract({ protocol: 'corecare-entitlements/1', version: 'v1', checksum: 'sum', product: { code: 'CARE' }, organisation: { id: 'org-1', externalId: 'org-1' }, access: { mode: 'full', reason: 'trial_active', subscriptionStatus: 'trial' }, subscription: { status: 'trial', limits: { users: 5, clients: 15 } }, features: { dashboard: true, medication: false }, details: [] }, organisation);
  assert.equal(contract.features.medication, false);
  assert.deepEqual(contract.subscription.limits, { users: 5, clients: 15 });
  assert.throws(() => validateEntitlementContract({ ...contract, product: { code: 'POS' } }, organisation), /different product/i);
  assert.throws(() => validateEntitlementContract({ ...contract, subscription: { ...contract.subscription, limits: { users: -1, clients: 15 } } }, organisation), /limits are invalid/i);
});

test('Care entitlement retries cap at one day', () => {
  const now = new Date('2026-08-04T00:00:00.000Z');
  assert.equal(nextAttempt(1, now), '2026-08-04T00:05:00.000Z');
  assert.equal(nextAttempt(99, now), '2026-08-05T00:00:00.000Z');
});

test('Care fails closed without a fresh entitlement and expires trials at the exact instant', () => {
  const now = Date.parse('2026-08-05T12:00:00.000Z');
  assert.equal(effectiveSubscriptionAccess(null, null, now).mode, 'locked');
  assert.equal(effectiveSubscriptionAccess({ mode: 'full', subscriptionStatus: 'active' }, '2026-08-05T11:44:59.999Z', now).reason, 'entitlement_stale');
  assert.equal(effectiveSubscriptionAccess({ mode: 'full', subscriptionStatus: 'trial', trialEndsAt: '2026-08-05T12:00:00.000Z' }, '2026-08-05T11:59:00.000Z', now).reason, 'trial_expired');
  assert.equal(effectiveSubscriptionAccess({ mode: 'full', subscriptionStatus: 'trial' }, '2026-08-05T11:59:00.000Z', now).reason, 'trial_expiry_unavailable');
  assert.equal(effectiveSubscriptionAccess({ mode: 'full', subscriptionStatus: 'active' }, '2026-08-05T11:59:00.000Z', now).mode, 'full');
});

test('Care synchronises entitlements through Platform health polling and forces stale login refreshes', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const config = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(source, /url\.pathname === "\/api\/health"[\s\S]*context\.waitUntil\(maybeRunScheduledMaintenance\(env\)\)/);
  assert.match(source, /work\.push\(syncPlatformEntitlements\(env\)\)/);
  assert.match(source, /syncPlatformEntitlements\(env,\{limit:100,force:true\}\)/);
  assert.doesNotMatch(config, /"crons"/);
});

test('Care blocks active user and client creation when the central plan limit is reached', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /SUBSCRIPTION_LIMIT_REACHED/);
  assert.match(source, /subscriptionResourceLimitGuard\(env,session\.organisation_id,'clients'\)/);
  assert.ok((source.match(/subscriptionResourceLimitGuard\(env,session\.organisation_id,'users'\)/g) || []).length >= 6);
});
