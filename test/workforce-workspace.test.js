import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateLiveDashboard } from '../src/operational-workspaces.js';
import { workforceSetupStatements } from '../src/workforce-seed.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0050_staff_workforce_hub.sql', import.meta.url), 'utf8');
const accessControl = readFileSync(new URL('../src/access-control.js', import.meta.url), 'utf8');

test('Care workforce hub covers the full staff-record lifecycle', () => {
  for (const table of [
    'staff_recruitment_checks', 'staff_employment_history', 'staff_supervisions',
    'staff_training_catalog', 'staff_training_records', 'staff_competencies',
    'staff_qualifications', 'staff_appraisals', 'staff_absences', 'staff_hr_cases',
    'staff_documents', 'staff_record_events'
  ]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));

  for (const permission of [
    'staff.records.manage', 'staff.supervision.manage', 'staff.training.manage',
    'staff.documents.manage', 'staff.hr.manage', 'staff.reports.view'
  ]) assert.match(`${worker}\n${accessControl}`, new RegExp(permission.replaceAll('.', '\\.')));

  assert.match(worker, /\/api\/workforce\/training-catalog/);
  assert.match(worker, /staff\.documents\.downloaded/);
  assert.match(worker, /selfDocumentTypes\.includes\(row\.document_type\)/);
});

test('staff workspace exposes management and self-service workflows', () => {
  for (const id of [
    'workforce-directory', 'staff-record-workspace', 'workforce-settings-dialog',
    'training-catalogue-dialog', 'workforce-record-dialog', 'staff-document-dialog',
    'staff-acknowledgement-dialog'
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(app, /async function loadMyStaffRecord/);
  assert.match(app, /function renderStaffSupervisions/);
  assert.match(app, /function renderStaffTraining/);
  assert.match(app, /function renderStaffHr/);
  assert.match(app, /function exportWorkforceAssurance/);
  assert.match(app, /data-workforce-ack/);
});

test('manager dashboard uses live workforce readiness instead of legacy placeholders', () => {
  const result = calculateLiveDashboard({
    staff: [{ id: 'staff-1', status: 'Active', dbs_expiry: '2030-01-01', training_expiry: '2030-01-01' }],
    workforce: {
      staff: [{ id: 'staff-1', status: 'Active', readiness: { readinessStatus: 'restricted', scores: { training: 25, recruitment: 60 } } }]
    }
  }, new Date('2026-08-06T12:00:00Z'));

  assert.equal(result.metrics.complianceDue, 1);
  assert.equal(result.compliance.training, 25);
  assert.equal(result.compliance.staffChecks, 60);
  assert.ok(result.priorities.some(item => item.key === 'staff-compliance'));
});

test('new Care organisations receive workforce policy and the starter training catalogue', () => {
  const prepared = [];
  const db = { prepare(sql) { return { bind(...values) { const statement = { sql, values }; prepared.push(statement); return statement; } }; } };
  const statements = workforceSetupStatements(db, 'org-new', 'owner-user');
  assert.equal(statements.length, 13);
  assert.equal(prepared[0].values[0], 'org-new');
  assert.ok(prepared.some(statement => statement.values.includes('org-new:training:safeguarding-adults')));
  assert.ok(prepared.some(statement => statement.values.includes('Medication administration and competency')));
  assert.match(worker, /workforceSetupStatements\(db,id,session\.user_id\)/);
});
