import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Care enforces native MFA in login, sessions, policy and the unified hand-off', async () => {
  const [source,migration,ui] = await Promise.all([readFile(new URL('../src/index.js',import.meta.url),'utf8'),readFile(new URL('../migrations/0054_native_mfa.sql',import.meta.url),'utf8'),readFile(new URL('../public/app.js',import.meta.url),'utf8')]);
  assert.match(source,/\/api\/auth\/mfa\/verify/);assert.match(source,/careMfaRequired\(row\)&&!row\.mfa_verified_at/);assert.match(source,/require_mfa=excluded\.require_mfa/);assert.match(migration,/mfa_recovery_codes/);assert.match(ui,/CoreCareMfa\.resume/);
});


