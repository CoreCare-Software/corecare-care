import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePlatformOrganisation } from '../src/platform-organisations.js';

function rowFor(sql) {
  if (sql.includes('FROM organisations')) return { id: 'org-demo', name: 'CoreCare', status: 'active' };
  if (sql.includes('FROM branches')) return { total: 1, active: 1 };
  if (sql.includes('FROM users')) return { total: 2, active: 2 };
  if (sql.includes('FROM clients')) return { total: 3, active: 2 };
  if (sql.includes('FROM staff')) return { total: 4, active: 3 };
  if (sql.includes('FROM care_plans')) return { total: 5, active: 4 };
  if (sql.includes('FROM platform_support_tickets')) return { total: 6, open: 2 };
  throw new Error(`Unexpected SQL: ${sql}`);
}

test('Care organisation summary uses the central support-ticket schema', async () => {
  const statements = [];
  const database = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() {
          return { first: async () => rowFor(sql) };
        },
      };
    },
  };

  const response = await handlePlatformOrganisation(new Request('https://care.example/api/platform/organisations/org-demo', {
    headers: { 'x-corecare-product-key': 'care-secret' },
  }), { DB: database, CORECARE_PRODUCT_KEY: 'care-secret' }, 'org-demo');

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.metrics, {
    branches: 1,
    activeBranches: 1,
    users: 2,
    activeUsers: 2,
    clients: 3,
    activeClients: 2,
    staff: 4,
    activeStaff: 3,
    carePlans: 5,
    activeCarePlans: 4,
    supportTickets: 6,
    openSupportTickets: 2,
  });
  const ticketQuery = statements.find(sql => sql.includes('FROM platform_support_tickets'));
  assert.match(ticketQuery, /source_product='CARE'/);
  assert.match(ticketQuery, /product_id='product-care'/);
  assert.doesNotMatch(ticketQuery, /product_code/);
});
