import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nextAttempt, validateEntitlementContract } from '../src/platform-entitlements.js';

const organisation = { platform_organisation_id: 'org-1', external_organisation_id: 'org-1' };

test('validates a Care entitlement contract and rejects cross-product state', () => {
  const contract = validateEntitlementContract({ protocol: 'corecare-entitlements/1', version: 'v1', checksum: 'sum', product: { code: 'CARE' }, organisation: { id: 'org-1', externalId: 'org-1' }, features: { dashboard: true, medication: false }, details: [] }, organisation);
  assert.equal(contract.features.medication, false);
  assert.throws(() => validateEntitlementContract({ ...contract, product: { code: 'POS' } }, organisation), /different product/i);
});

test('Care entitlement retries cap at one day', () => {
  const now = new Date('2026-08-04T00:00:00.000Z');
  assert.equal(nextAttempt(1, now), '2026-08-04T00:05:00.000Z');
  assert.equal(nextAttempt(99, now), '2026-08-05T00:00:00.000Z');
});

test('Care synchronises entitlements when Platform performs its scheduled health poll', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /context\?\.waitUntil\?\.\(syncPlatformEntitlements\(env\)\)/);
  assert.doesNotMatch(source, /scheduled\(_event, env, context\)/);
});
