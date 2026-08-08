import test from 'node:test';
import assert from 'node:assert/strict';
import { exitSupportMode } from '../src/index.js';
import { PLATFORM_SUPPORT_EMAIL, exchangePlatformAccess, platformOrigin, supportMutationDenied } from '../src/platform-access.js';

function validExchange(overrides = {}) {
  return {
    ok: true,
    protocol: 'corecare-platform-access/1',
    support_session: { id: 'support-1', access_mode: 'read_only', reason: 'Investigate care record issue', expires_at: new Date(Date.now() + 3600000).toISOString() },
    organisation: { id: 'central-org', external_id: 'care-org', name: 'Example Care' },
    platform_user: { email: 'owner@example.test', name: 'Platform Owner' },
    ...overrides,
  };
}

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

test('Care rejects an exact Platform origin mismatch before exchange', async () => {
  let exchanged = false;
  const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fwrong-platform.corecare.example'), {
    DB: {},
    PLATFORM_ORIGIN: 'https://platform.corecare.example',
    CORECARE_PRODUCT_KEY: 'care-secret',
    CORECARE_PLATFORM: { async fetch() { exchanged = true; return Response.json({}); } },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.message, 'The Platform access request is invalid.');
  assert.equal(exchanged, false);
});

test('Care establishes an audited support-mode session from a valid exchange', async () => {
  const batched = [];
  const database = {
    prepare(sql) {
      return { bind(...values) {
        if (sql.includes('FROM organisations')) return { first: async () => ({ id: 'care-org', name: 'Example Care', status: 'active' }) };
        if (sql.includes('FROM branches')) return { first: async () => ({ id: 'care-branch' }) };
        if (sql.includes('FROM users')) return { first: async () => ({ id: 'owner-1', organisation_id: 'care-org', email: 'owner@example.test', display_name: 'Platform Owner', access_level: 'platform_owner', is_platform_user: 1, home_branch_id: 'care-branch', status: 'active' }) };
        return { sql, values };
      }};
    },
    async batch(statements) { batched.push(...statements); },
  };
  const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fplatform.corecare.example'), {
    DB: database,
    PLATFORM_ORIGIN: 'https://platform.corecare.example',
    CORECARE_PRODUCT_KEY: 'care-secret',
    CORECARE_PLATFORM: { fetch: async () => Response.json(validExchange()) },
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/?platform_access=success');
  assert.match(response.headers.get('set-cookie'), /^corecare_session=.*HttpOnly; Secure; SameSite=Lax;/);
  assert.equal(batched.length, 3);
  assert.equal(batched[0].values[3], 'care-branch');
});

test('Care creates a target-scoped non-login support principal when the owner has no local Care login', async () => {
  const batched = [], writes = [];
  let exchangedRequest;
  const principal = { id: 'support-principal-1', organisation_id: 'care-org', email: PLATFORM_SUPPORT_EMAIL, display_name: 'CoreCare Platform Support', access_level: 'platform_admin', is_platform_user: 1, home_branch_id: 'care-branch', status: 'active' };
  const database = {
    prepare(sql) {
      return { bind(...values) {
        const statement = { sql, values, run: async () => ({ meta: { changes: 1 } }) };
        if (sql.includes('FROM organisations')) return { first: async () => ({ id: 'care-org', name: 'Example Care', status: 'active' }) };
        if (sql.includes('FROM branches')) return { first: async () => ({ id: 'care-branch' }) };
        if (sql.includes('lower(email)')) return { first: async () => null };
        if (sql.includes('FROM users WHERE organisation_id=? AND email=?')) return { first: async () => principal };
        if (sql.startsWith('INSERT OR IGNORE INTO users') || sql.startsWith('UPDATE users SET') || sql.startsWith('INSERT INTO audit_log')) writes.push(statement);
        return statement;
      }};
    },
    async batch(statements) { batched.push(...statements); },
  };
  const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fplatform.corecare.example'), {
    DB: database,
    PLATFORM_ORIGIN: 'https://platform.corecare.example',
    CORECARE_PRODUCT_KEY: 'care-secret',
    CORECARE_PLATFORM: { async fetch(request) { exchangedRequest = request; return Response.json(validExchange()); } },
  });
  assert.equal(response.status, 302);
  assert.equal(new URL(exchangedRequest.url).pathname, '/api/platform/access/exchange');
  assert.equal(exchangedRequest.headers.has('x-corecare-product-key'), true);
  const insert = writes.find(statement => statement.sql.startsWith('INSERT OR IGNORE INTO users'));
  assert.ok(insert);
  assert.equal(insert.values.includes(PLATFORM_SUPPORT_EMAIL), true);
  assert.equal(insert.values.includes('owner@example.test'), false);
  assert.match(insert.sql, /password_hash,password_salt/);
  assert.match(insert.sql, /NULL,NULL,'active',0/);
  assert.equal(batched[0].values[1], principal.id);
  assert.equal(batched[0].values[2], 'care-org');
  assert.equal(batched[0].values[3], 'care-branch');
  assert.equal(writes.some(statement => statement.sql.startsWith('INSERT INTO audit_log')), true);
});

test('Care fails closed when the target organisation has no active branch', async () => {
  let batched = false;
  const database = {
    prepare(sql) {
      return { bind() {
        if (sql.includes('FROM organisations')) return { first: async () => ({ id: 'care-org', name: 'Example Care', status: 'active' }) };
        if (sql.includes('FROM branches')) return { first: async () => null };
        throw new Error(`Unexpected SQL: ${sql}`);
      }};
    },
    async batch() { batched = true; },
  };
  const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fplatform.corecare.example'), {
    DB: database,
    PLATFORM_ORIGIN: 'https://platform.corecare.example',
    CORECARE_PRODUCT_KEY: 'care-secret',
    CORECARE_PLATFORM: { fetch: async () => Response.json(validExchange()) },
  });
  assert.equal(response.status, 404);
  assert.match((await response.json()).error.message, /no active branch/i);
  assert.equal(batched, false);
});

test('Care preserves Platform grant replay and expiry rejection', async () => {
  for (const message of ['The access grant was already used.', 'The access grant has expired or was already used.']) {
    const response = await exchangePlatformAccess(new Request('https://care.corecare.example/platform-access?code=grant&platform_origin=https%3A%2F%2Fplatform.corecare.example'), {
      DB: {},
      PLATFORM_ORIGIN: 'https://platform.corecare.example',
      CORECARE_PRODUCT_KEY: 'care-secret',
      CORECARE_PLATFORM: { fetch: async () => Response.json({ error: { message } }, { status: 410 }) },
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error.message, message);
  }
});

test('read-only support sessions deny mutations but allow safe exit', () => {
  const session = { support_mode: 1, support_access_mode: 'read_only' };
  assert.equal(supportMutationDenied(new Request('https://care.example/api/clients', { method: 'POST' }), session), true);
  assert.equal(supportMutationDenied(new Request('https://care.example/api/clients'), session), false);
  assert.equal(supportMutationDenied(new Request('https://care.example/api/platform/exit-support', { method: 'POST' }), session), false);
});

test('cross-product support exit ends audit lifecycle, clears the session and returns to Platform', async () => {
  const batched = [];
  const database = {
    prepare(sql) { return { bind(...values) { return { sql, values }; } }; },
    async batch(statements) { batched.push(...statements); },
  };
  const response = await exitSupportMode({ DB: database, PLATFORM_ORIGIN: 'https://platform.corecare.example/path' }, {
    session_id: 'session-1', user_id: 'support-principal-1', organisation_id: 'care-org', email: PLATFORM_SUPPORT_EMAIL,
    is_platform_user: 1, access_level: 'platform_admin', support_mode: 1,
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).returnUrl, 'https://platform.corecare.example/');
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(batched.length, 3);
  assert.match(batched[0].sql, /UPDATE support_sessions SET ended_at/);
  assert.match(batched[1].sql, /INSERT INTO audit_log/);
  assert.match(batched[2].sql, /DELETE FROM sessions/);
});
