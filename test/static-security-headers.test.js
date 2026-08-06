import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');

test('static Care responses retain the production security headers', () => {
  for (const header of [
    'Strict-Transport-Security:',
    'Content-Security-Policy:',
    'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY',
    'Referrer-Policy:',
    'Permissions-Policy:',
  ]) assert.match(headers, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
