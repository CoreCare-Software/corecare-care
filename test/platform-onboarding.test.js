import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onboardingInvitationExpiresAt } from '../src/platform-onboarding.js';

test('owner-issued Care onboarding invitations last exactly 48 hours and replace older unused links', async () => {
  const issuedAt = Date.parse('2026-08-07T10:00:00.000Z');
  assert.equal(onboardingInvitationExpiresAt(issuedAt), '2026-08-09T10:00:00.000Z');
  const source = await readFile(new URL('../src/platform-onboarding.js', import.meta.url), 'utf8');
  assert.match(source, /UPDATE password_reset_tokens SET consumed_at=CURRENT_TIMESTAMP/);
  assert.match(source, /purpose\) VALUES\(\?,\?,\?,\?,\?,'activation'\)/);
  assert.match(source, /searchParams\.set\('activation', '1'\)/);
});

test('Care exposes private organisation-user and invitation operations to the Platform identity broker', async () => {
  const worker = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(worker, /listOrganisationUsers\(input\)/);
  assert.match(worker, /issueOnboardingInvitation\(input\)/);
});
