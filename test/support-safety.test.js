import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeErrorMessage } from '../src/runtime-errors.js';

test('Care keeps password hashing within the Cloudflare Workers limit', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS\s*=\s*100000/);
  assert.match(source, /PASSWORD_ITERATIONS\s*=\s*CLOUDFLARE_WORKERS_PBKDF2_MAX_ITERATIONS/);
  assert.doesNotMatch(source, /PASSWORD_ITERATIONS\s*=\s*600000/);
});

test('Care records unhandled API failures durably without storing request bodies', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../migrations/0057_support_safety_branch_archive.sql', import.meta.url), 'utf8');
  assert.match(source, /await recordRuntimeError\(env,/);
  assert.match(migration, /ALTER TABLE api_error_log ADD COLUMN request_id TEXT/);
  assert.match(migration, /ALTER TABLE api_error_log ADD COLUMN product_code TEXT/);
  assert.doesNotMatch(source, /recordRuntimeError\([^)]*(?:request\.body|requestBody|body:)/s);
});

test('Care runtime error messages redact common credentials and personal data', () => {
  const message = safeErrorMessage(new Error('POST https://private.example/a owner@example.test token=abcdef password:hunter2'));
  assert.doesNotMatch(message, /private\.example|owner@example\.test|abcdef|hunter2/);
  assert.match(message, /\[url\]/);
  assert.match(message, /\[email\]/);
  assert.match(message, /token=\[redacted\]/i);
  assert.match(message, /password=\[redacted\]/i);
});

test('Branch lifecycle uses archive and restore endpoints with historical retention', () => {
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(source, /changeBranchLifecycle/);
  assert.match(source, /BRANCH_ARCHIVE_BLOCKED/);
  assert.match(source, /archived_at=CURRENT_TIMESTAMP/);
  assert.match(browser, /Archived branches/);
  assert.match(browser, /data-restore-branch/);
});
