import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessStaffAllocation } from '../src/commercial-readiness.js';

test('approved annual leave is an explicit rota allocation blocker', () => {
  const result = assessStaffAllocation({
    staff: { status: 'Active' },
    visit: {},
    absence: { leave_category: 'annual_leave' },
  });

  assert.equal(result.allowed, false);
  assert.ok(result.blockers.some(item => item.code === 'STAFF_ON_HOLIDAY'));
  assert.ok(!result.blockers.some(item => item.code === 'STAFF_ABSENT'));
});

test('ordinary active absences retain the general rota blocker', () => {
  const result = assessStaffAllocation({
    staff: { status: 'Active' },
    visit: {},
    absence: { leave_category: 'absence' },
  });

  assert.equal(result.allowed, false);
  assert.ok(result.blockers.some(item => item.code === 'STAFF_ABSENT'));
});

test('holiday workflow and allocation protection are wired end to end', async () => {
  const [worker, rota, app, html, migration] = await Promise.all([
    readFile(new URL('../src/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/rota-safety.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0056_staff_holiday_rota_protection.sql', import.meta.url), 'utf8'),
  ]);

  assert.match(app, /holiday\|Holiday \/ annual leave/);
  assert.match(app, /rotaImpact\?\.visitsUnallocated/);
  assert.match(html, /Holidays & attendance/);
  assert.match(worker, /requestedType==='holiday'/);
  assert.match(worker, /staff_absence_rota_impacts/);
  assert.match(worker, /async function available\(candidate\).*assessStaffAllocationDb/);
  assert.match(worker, /async function createVisit[\s\S]*?assessStaffAllocationDb/);
  assert.match(rota, /SELECT id,absence_type,leave_category/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS staff_absence_rota_impacts/);
  assert.match(migration, /staff_unavailable_assignment_insert/);
  assert.match(migration, /staff_unavailable_visit_insert/);
  assert.match(worker, /allocation_status='removed'/);
  assert.match(worker, /rota_status=CASE WHEN rota_status='published' THEN 'draft'/);
  assert.match(worker, /'absence',exceptionSummary/);
});
