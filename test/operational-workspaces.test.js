import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessRotaPublication, calculateLiveDashboard, normaliseFamilyAccess, visitLiveStatus } from '../src/operational-workspaces.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('rota publication requires allocated visits, valid times and resolved travel', () => {
  const ready = assessRotaPublication([{ id: 'one', rota_status: 'draft', status: 'scheduled', staff_id: 'staff-one', scheduled_start: '2026-08-03T08:00:00Z', scheduled_end: '2026-08-03T08:30:00Z', travel_conflict: 0 }]);
  assert.equal(ready.ready, true);
  assert.equal(ready.draft, 1);

  const blocked = assessRotaPublication([
    { id: 'unallocated', rota_status: 'draft', status: 'scheduled', staff_id: null, scheduled_start: '2026-08-03T09:00:00Z', scheduled_end: '2026-08-03T09:30:00Z' },
    { id: 'travel', rota_status: 'draft', status: 'scheduled', staff_id: 'staff-one', scheduled_start: '2026-08-03T10:00:00Z', scheduled_end: '2026-08-03T10:30:00Z', travel_conflict: 1, travel_override: 0 },
    { id: 'invalid', rota_status: 'draft', status: 'scheduled', staff_id: 'staff-one', scheduled_start: '2026-08-03T11:00:00Z', scheduled_end: '2026-08-03T10:00:00Z' }
  ]);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.unallocated, 1);
  assert.equal(blocked.travelConflicts, 1);
  assert.equal(blocked.invalidTimes, 1);
});

test('live visit status identifies due, late and overrunning care', () => {
  const now = new Date('2026-08-03T12:00:00Z');
  assert.equal(visitLiveStatus({ status: 'scheduled', scheduled_start: '2026-08-03T11:30:00Z' }, now), 'late');
  assert.equal(visitLiveStatus({ status: 'scheduled', scheduled_start: '2026-08-03T12:10:00Z' }, now), 'due');
  assert.equal(visitLiveStatus({ status: 'in_progress', scheduled_start: '2026-08-03T11:00:00Z', scheduled_end: '2026-08-03T11:45:00Z' }, now), 'overrunning');
});

test('manager dashboard figures are calculated from operational records', () => {
  const now = new Date('2026-08-03T12:00:00Z');
  const result = calculateLiveDashboard({
    clients: [{ status: 'Active', risk: 'High', next_review: '2026-08-01' }],
    staff: [{ status: 'Active', dbs_expiry: '2027-01-01', training_expiry: '2027-01-01' }],
    plans: [{ status: 'Active', review_date: '2026-08-20' }],
    risks: [{ status: 'Active', severity: 'High' }],
    visits: [
      { status: 'completed', rota_status: 'published', staff_id: 'staff-one', scheduled_start: '2026-08-03T08:00:00Z', scheduled_end: '2026-08-03T08:30:00Z' },
      { status: 'scheduled', rota_status: 'draft', staff_id: null, scheduled_start: '2026-08-03T11:30:00Z', scheduled_end: '2026-08-03T12:00:00Z' }
    ],
    tasks: [{ status: 'open', due_at: '2026-08-03T10:00:00Z' }],
    incidents: [{ status: 'open', severity: 'critical' }]
  }, now);
  assert.equal(result.metrics.activeClients, 1);
  assert.equal(result.today.total, 2);
  assert.equal(result.today.completed, 1);
  assert.equal(result.today.unallocated, 1);
  assert.equal(result.compliance.overall, 100);
  assert.ok(result.priorities.some(item => item.key === 'draft-rota'));
  assert.ok(result.priorities.some(item => item.key === 'high-incidents'));
});

test('family sharing defaults are explicit and support revoking individual record types', () => {
  assert.deepEqual(normaliseFamilyAccess({}), { canViewProfile: true, canViewVisits: true, canViewCareUpdates: true, canViewDocuments: false, canViewMedication: false });
  assert.deepEqual(normaliseFamilyAccess({ canViewProfile: false, canViewVisits: '0', canViewCareUpdates: true, canViewDocuments: 'on', canViewMedication: 1 }), { canViewProfile: false, canViewVisits: false, canViewCareUpdates: true, canViewDocuments: true, canViewMedication: true });
});

test('live rota, manager and family workspaces are wired through the Worker and browser', () => {
  assert.match(worker, /"\/api\/rota\/publish"/);
  assert.match(worker, /assessRotaPublication\(rows\)/);
  assert.match(worker, /"\/api\/family\/portal"/);
  assert.match(worker, /COALESCE\(v\.rota_status,'published'\)='published'/);
  assert.match(worker, /calculateLiveDashboard/);
  assert.match(html, /id="family-page"/);
  assert.match(html, /id="rota-publish-week"/);
  assert.match(html, /id="dash-visit-list"/);
  assert.doesNotMatch(html, /31 of 46 visits completed/);
  assert.match(app, /async function loadFamilyManagement/);
  assert.match(app, /async function loadFamilyPortalPage/);
  assert.match(app, /workspaceKey\(\)===['"]family['"]&&page===['"]family['"]/);
  assert.match(worker, /family:\s*\[\]/);
  assert.match(app, /async function publishRotaWeek/);
});

test('family login creation and management stay inside the Family Portal', () => {
  assert.match(worker, /"\/api\/family-access\/accounts"/);
  assert.match(worker, /async function createFamilyAccount/);
  assert.match(worker, /async function updateFamilyAccount/);
  assert.match(worker, /access_level='family'/);
  assert.match(worker, /VALUES \(\?,\?,\?,\?,\?,'family'/);
  assert.match(worker, /family_portal\.manage/);
  assert.match(worker, /async function revokeFamilyAccess[\s\S]*c\.branch_id=\?/);
  assert.match(app, /id="family-account-dialog"/);
  assert.match(app, /id="family-account-settings-dialog"/);
  assert.match(app, /api\('\/api\/family-access\/accounts'/);
  assert.match(app, /function settingsUsers\(\)\{return users\.filter\(user=>user\.accessLevel!=='family'\);\}/);
  assert.match(app, /settingsUsers\(\)\.filter\(u=>u\.status==='active'\)/);
  assert.doesNotMatch(app, /data-page-link="settings">Create family login/);
  assert.doesNotMatch(app, /Create a family login in Settings/);
  assert.doesNotMatch(html, /<option value="family">Family member<\/option>/);
});
