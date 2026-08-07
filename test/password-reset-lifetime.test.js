import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_RESET_HOURS, passwordResetExpiresAt } from '../src/index.js';

test('Care password-reset and account-activation links remain valid for exactly 48 hours', () => {
  const issuedAt = Date.parse('2026-08-07T10:15:00.000Z');
  assert.equal(PASSWORD_RESET_HOURS, 48);
  assert.equal(passwordResetExpiresAt(issuedAt), '2026-08-09T10:15:00.000Z');
});
