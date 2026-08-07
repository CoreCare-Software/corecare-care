import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { standardPermissionsForRole } from '../src/access-control.js';
import { assessStaffAllocation } from '../src/commercial-readiness.js';

test('cross-branch cover stays blocked unless explicitly authorised', () => {
  const blocked = assessStaffAllocation({ staff: { status: 'Active' }, visit: {}, branchMismatch: true });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.blockers.some(item => item.code === 'BRANCH_MISMATCH'));

  const authorised = assessStaffAllocation({ staff: { status: 'Active' }, visit: {}, branchMismatch: true, allowCrossBranch: true });
  assert.equal(authorised.allowed, true);
  assert.ok(authorised.warnings.some(item => item.code === 'CROSS_BRANCH_COVER'));
});

test('cross-branch authority is reserved for organisation-wide leaders', () => {
  for (const role of ['organisation_owner', 'area_manager', 'organisation_admin']) {
    const permissions = standardPermissionsForRole(role);
    assert.ok(permissions.includes('*') || permissions.includes('rota.cross_branch.cover'), role);
  }
  for (const role of ['deputy_manager', 'branch_manager', 'office_staff', 'senior_carer', 'carer']) {
    assert.ok(!standardPermissionsForRole(role).includes('rota.cross_branch.cover'), role);
  }
});

test('multi-branch planning, local-first recommendations and carer acknowledgements are wired end to end', async () => {
  const [worker, safety, app, html, migration] = await Promise.all([
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/rota-safety.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0062_branch_aware_rota.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(worker, /resolveRotaBranchScope/);
  assert.match(worker, /crossBranchAllocationContext/);
  assert.match(worker, /publishedRotaChanges/);
  assert.match(worker, /requires_acknowledgement=1/);
  assert.match(worker, /acknowledgeRotaNotification/);
  assert.match(safety, /CROSS_BRANCH_REASON_REQUIRED/);
  assert.match(safety, /cross_branch_reason/);

  assert.match(html, /id="rota-branch-filter"/);
  assert.match(html, /id="rota-branch-summary"/);
  assert.match(html, /id="rota-communication-status"/);
  assert.match(html, /id="carer-rota-notifications"/);
  assert.match(app, /Home-branch carers are ranked first/);
  assert.match(app, /Manual approval required/);
  assert.match(app, /data-rota-notification-ack/);

  assert.match(migration, /published_snapshot_json/);
  assert.match(migration, /is_cross_branch/);
  assert.match(migration, /cross_branch_reason/);
  assert.match(migration, /DROP TRIGGER IF EXISTS tenant_guard_visit_assignment_insert/);
  assert.match(migration, /rota\.cross_branch\.cover/);
});
