import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('Care exposes authenticated opt-in AI rewrite through the private Platform broker', () => {
  assert.match(worker, /\/api\/ai\/rewrite/);
  assert.match(worker, /session\.organisation_id/);
  assert.match(worker, /session\.user_id/);
  assert.match(config, /"binding": "CORECARE_AI"/);
  assert.match(config, /"entrypoint": "AiRewriteBroker"/);
  assert.match(html, /ai-rewrite\.js/);
  assert.match(html, /ai-rewrite\.css/);
});
