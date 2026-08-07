import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { restrictedRoleRouteAllowed } from '../src/access-control.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0060_staff_line_manager_accounts.sql', import.meta.url), 'utf8');

test('family accounts are confined to deliberately shared portal routes', () => {
  assert.equal(restrictedRoleRouteAllowed('family', '/api/family/portal', 'GET'), true);
  assert.equal(restrictedRoleRouteAllowed('family', '/api/documents/document-1/file', 'GET'), true);
  assert.equal(restrictedRoleRouteAllowed('family', '/api/dashboard', 'GET'), false);
  assert.equal(restrictedRoleRouteAllowed('family', '/api/staff', 'GET'), false);
  assert.equal(restrictedRoleRouteAllowed('family', '/api/clients', 'GET'), false);
});

test('care workers are confined to their own delivery and development workflows', () => {
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/carer/dashboard', 'GET', 'staff-1'), true);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/visits/visit-1/care-record', 'POST', 'staff-1'), true);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff/staff-1/documents/doc-1/file', 'GET', 'staff-1'), true);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff/staff-1/documents/doc-1/file', 'POST', 'staff-1'), false);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff/staff-1/workforce/supervisions/sup-1/acknowledge', 'POST', 'staff-1'), true);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff/staff-1/workforce/supervisions/sup-1/acknowledge', 'GET', 'staff-1'), false);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff/staff-2/documents/doc-1/file', 'GET', 'staff-1'), false);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff/%E0%A4%A/documents/doc-1/file', 'GET', 'staff-1'), false);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/visits/board', 'GET', 'staff-1'), false);
  assert.equal(restrictedRoleRouteAllowed('carer', '/api/staff', 'GET', 'staff-1'), false);
});

test('family login and line-manager actions are wired and tenant guarded', () => {
  assert.match(app, /Add an active client before creating a family login/);
  assert.match(app, /populateStaffLineManagers/);
  assert.match(worker, /managerCandidates/);
  assert.match(worker, /roleRank\(user\.access_level\)<=roleRank\(targetAccessLevel\)/);
  assert.match(worker, /user\.home_branch_id!==targetBranchId/);
  assert.match(app, /candidate\.scope==='organisation'\|\|candidate\.branchId===targetBranch/);
  assert.match(migration, /line_manager_user_id/);
  assert.match(migration, /tenant_guard_staff_line_manager_insert/);
  assert.match(migration, /tenant_guard_staff_line_manager_update/);
});
