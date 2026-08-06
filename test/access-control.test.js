import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STANDARD_ROLE_PROFILES,
  accessReviewState,
  canAssignStandardRole,
  impliedPermissionSources,
  standardPermissionsForRole
} from '../src/access-control.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0052_role_access_governance.sql', import.meta.url), 'utf8');

test('registered and branch managers have complete operational rota authority', () => {
  const required = [
    'rota.view', 'rota.create', 'rota.edit', 'rota.publish', 'rota.cancel',
    'rota.templates.view', 'rota.templates.manage', 'rota.templates.generate',
    'rota.travel.override', 'rota.travel.settings', 'rota.visit.lock',
    'rota.visit.override_lock', 'rota.time_critical.override'
  ];
  for (const role of ['organisation_admin', 'deputy_manager', 'branch_manager']) {
    const permissions = standardPermissionsForRole(role);
    for (const permission of required) assert.ok(permissions.includes(permission), `${role} is missing ${permission}`);
  }
});

test('care coordinators can plan and publish rotas without manager approval', () => {
  const permissions = standardPermissionsForRole('office_staff');
  for (const permission of [
    'rota.create', 'rota.edit', 'rota.publish', 'rota.cancel',
    'rota.templates.manage', 'rota.templates.generate', 'rota.travel.override',
    'visits.create', 'visits.codes.manage'
  ]) assert.ok(permissions.includes(permission), `care coordinator is missing ${permission}`);
  assert.doesNotMatch(worker, /\/api\/rota"[^\n]+requireManagementWorkspace/);
  assert.match(app, /office_staff:'Care coordinator'/);
});

test('care workers and senior carers receive clinical action permissions without management access', () => {
  const careWorker = standardPermissionsForRole('carer');
  assert.ok(careWorker.includes('medication.administer'));
  assert.ok(careWorker.includes('incidents.create'));
  assert.ok(careWorker.includes('tasks.complete'));
  assert.ok(!careWorker.includes('medication.manage'));
  assert.ok(!careWorker.includes('incidents.review'));

  const senior = standardPermissionsForRole('senior_carer');
  assert.ok(senior.includes('incidents.review'));
  assert.ok(senior.includes('medication.stock.manage'));
  assert.ok(!senior.includes('security.users.manage'));
});

test('auditor access remains read-only', () => {
  const auditor = standardPermissionsForRole('auditor');
  const writeTokens = ['.manage', '.create', '.edit', '.archive', '.publish', '.cancel', '.administer', '.correct', '.complete', '.override'];
  assert.ok(auditor.length > 0);
  assert.deepEqual(auditor.filter(permission => writeTokens.some(token => permission.includes(token))), []);
});

test('role hierarchy prevents peer and upward assignment', () => {
  assert.equal(canAssignStandardRole('organisation_admin', 'deputy_manager'), true);
  assert.equal(canAssignStandardRole('branch_manager', 'office_staff'), true);
  assert.equal(canAssignStandardRole('branch_manager', 'branch_manager'), false);
  assert.equal(canAssignStandardRole('office_staff', 'branch_manager'), false);
  assert.equal(canAssignStandardRole('organisation_admin', 'organisation_owner'), false);
  assert.equal(canAssignStandardRole('organisation_owner', 'organisation_owner'), true);
});

test('permission implications and review states are deterministic', () => {
  assert.ok(impliedPermissionSources('medication.view').includes('medication.administer'));
  assert.ok(impliedPermissionSources('reports.view').includes('reports.export'));
  assert.equal(accessReviewState(null, new Date('2026-08-06T12:00:00Z')), 'not_reviewed');
  assert.equal(accessReviewState('2026-08-05', new Date('2026-08-06T12:00:00Z')), 'overdue');
  assert.equal(accessReviewState('2026-08-20', new Date('2026-08-06T12:00:00Z')), 'due_soon');
  assert.equal(accessReviewState('2027-01-01', new Date('2026-08-06T12:00:00Z')), 'current');
});

test('access-review persistence is tenant guarded and exposed in the settings interface', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS user_access_reviews/);
  assert.match(migration, /tenant_guard_user_access_review_insert/);
  assert.match(worker, /\/api\/security\/access-governance/);
  assert.match(worker, /\/api\/security\/access-reviews/);
  assert.match(app, /Access review register/);
  assert.equal(STANDARD_ROLE_PROFILES.office_staff.scope, 'assigned_branch');
});
