import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangePlatformAccess, platformOrigin } from '../src/platform-access.js';

test('Platform origin accepts HTTPS and local development only', () => {
  assert.equal(platformOrigin({ PLATFORM_ORIGIN: 'https://platform.corecare.example/path' }), 'https://platform.corecare.example');
  assert.equal(platformOrigin({ PLATFORM_ORIGIN: 'http://localhost:8787' }), 'http://localhost:8787');
  assert.equal(platformOrigin({ PLATFORM_ORIGIN: 'http://platform.corecare.example' }), '');
});

test('Care rejects a launch when product access is not configured', async () => {
  const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fplatform.corecare.example'), { DB: {} });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error.message, /not configured/i);
});

test('Care establishes an audited support-mode session from a valid exchange', async () => {
  const originalFetch = globalThis.fetch;
  const batched = [];
  globalThis.fetch = async () => Response.json({
    support_session: { id: 'support-1', access_mode: 'support', reason: 'Investigate care record issue', expires_at: new Date(Date.now() + 3600000).toISOString() },
    organisation: { id: 'central-org', external_id: 'care-org', name: 'Example Care' },
    platform_user: { email: 'owner@example.test', name: 'Platform Owner' },
  });
  const database = {
    prepare(sql) {
      return { bind(...values) {
        if (sql.includes('FROM organisations')) return { first: async () => ({ id: 'care-org', name: 'Example Care', status: 'active' }) };
        if (sql.includes('FROM users')) return { first: async () => ({ id: 'owner-1', organisation_id: 'platform-org', email: 'owner@example.test', display_name: 'Platform Owner', access_level: 'platform_owner', is_platform_user: 1, home_branch_id: null, status: 'active' }) };
        return { sql, values };
      }};
    },
    async batch(statements) { batched.push(...statements); },
  };
  try {
    const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fplatform.corecare.example'), {
      DB: database,
      PLATFORM_ORIGIN: 'https://platform.corecare.example',
      CORECARE_PRODUCT_KEY: 'care-secret',
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/?platform_access=success');
    assert.match(response.headers.get('set-cookie'), /^corecare_session=/);
    assert.equal(batched.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});
