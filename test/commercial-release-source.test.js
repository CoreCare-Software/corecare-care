import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('commercial care release wires quality, multi-carer rota, clinical assurance and safe invitations end to end', async () => {
  const [worker, ui, migration, rota, quality] = await Promise.all([
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0055_commercial_care_safety.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/rota-safety.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/quality-assurance.js', import.meta.url), 'utf8'),
  ]);
  assert.match(worker, /\/api\/quality/);
  assert.match(worker, /\/allocations\$/);
  assert.match(worker, /prepareAccountActivation/);
  assert.match(worker, /templateKey:'password_reset_link'/);
  assert.doesNotMatch(worker, /templateKey:'account_invitation'/);
  assert.match(ui, /id="quality-page"/);
  assert.match(ui, /id="rota-team-list"/);
  assert.match(ui, /Clinical assurance/);
  assert.match(ui, /Allergies and reactions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS visit_staff_assignments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS client_governance_records/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS service_feedback_cases/);
  assert.match(rota, /UNSAFE_ALLOCATION/);
  assert.match(quality, /calculateQualityDashboard/);
});
