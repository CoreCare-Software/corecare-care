import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0044_launch_readiness.sql', import.meta.url), 'utf8');
const maintenanceMigration = readFileSync(new URL('../migrations/0045_platform_coordinated_maintenance.sql', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('launch migration enforces branch boundaries and governance evidence', () => {
  for (const trigger of ['branch_guard_care_plan_update','branch_guard_risk_update','branch_guard_document_update','branch_guard_visit_update','branch_guard_task_update','branch_guard_incident_update','branch_guard_finance_invoice_update']) assert.match(migration, new RegExp(trigger));
  assert.match(migration, /require_independent_care_plan_approval/);
  assert.match(migration, /consent_basis/);
  assert.match(migration, /witness_user_id/);
  assert.match(migration, /duty_of_candour_required/);
  assert.match(migration, /storage_key/);
});

test('worker applies branch, session, eMAR and incident safety controls', () => {
  assert.match(worker, /enforceBranchScope/);
  assert.match(worker, /idle_timeout_minutes/);
  assert.match(worker, /databaseTimestampMs\(row\.last_seen_at\)/);
  assert.match(worker, /EMAR_REQUIRED/);
  assert.match(worker, /medicationWitness/);
  assert.match(worker, /require_independent_care_plan_approval/);
  assert.match(worker, /duty_of_candour_completed_at/);
  assert.match(worker, /client_visit_codes[\s\S]*expires_at/);
  assert.match(worker, /runScheduledMaintenance/);
  assert.match(maintenanceMigration, /CREATE TABLE IF NOT EXISTS system_maintenance_state/);
  assert.equal(config.triggers, undefined);
});

test('private documents use authenticated R2 storage and safe file detection', () => {
  assert.equal(config.r2_buckets[0].binding, 'CLIENT_FILES');
  assert.match(worker, /detectedDocumentType/);
  assert.match(worker, /CLIENT_FILES\.put/);
  assert.match(worker, /family_client_access[\s\S]*can_view_documents=1/);
  assert.match(html, /name="file" type="file"/);
  assert.match(app, /body instanceof FormData/);
});

test('visit completion cannot create a second medication record', () => {
  assert.doesNotMatch(html, /name="medicationOutcome"/);
  assert.match(html, /id="visit-open-emar"/);
  assert.match(app, /payload\.medication=\[\]/);
  assert.doesNotMatch(worker, /INSERT INTO visit_medication_records/);
});

test('report CSV cells neutralise spreadsheet formula prefixes', () => {
  assert.match(app, /\^\[\\t\\r \]\*\[=\+\\-@\]/);
});
