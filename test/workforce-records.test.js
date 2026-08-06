import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStaffReadiness, calculateWorkforceOverview, normaliseSupervisionActions, normaliseWorkforceSettings, staffRoleScopes, trainingApplies } from '../src/workforce-records.js';

const now = new Date('2026-08-06T12:00:00Z');
const staff = { id: 'staff-one', status: 'Active', job_title: 'Senior care worker', start_date: '2025-01-01' };
const catalogue = [
  { id: 'safe', name: 'Safeguarding', active: 1, requirement_level: 'core', role_scope_json: '["all"]', critical_for_allocation: 1 },
  { id: 'meds', name: 'Medication', active: 1, requirement_level: 'role', role_scope_json: '["care"]', critical_for_allocation: 1 },
  { id: 'office', name: 'Office induction', active: 1, requirement_level: 'role', role_scope_json: '["office"]', critical_for_allocation: 0 }
];

function completeRecords() {
  return {
    recruitment: [
      { check_type: 'identity', status: 'verified' },
      { check_type: 'right_to_work', status: 'verified' },
      { check_type: 'dbs', status: 'verified', expiry_date: '2027-08-06' },
      { check_type: 'reference', status: 'verified' },
      { check_type: 'reference', status: 'verified' }
    ],
    employmentHistory: [{ verified: 1 }],
    trainingCatalogue: catalogue,
    training: [
      { training_catalog_id: 'safe', status: 'completed', expiry_date: '2027-08-06' },
      { training_catalog_id: 'meds', status: 'completed', expiry_date: '2027-08-06' }
    ],
    competencies: [{ status: 'competent', expiry_date: '2027-08-06', critical_for_allocation: 1 }],
    supervisions: [{ status: 'completed', completed_at: '2026-07-20' }],
    appraisals: [{ status: 'completed', completed_at: '2026-04-01' }],
    qualifications: [],
    documents: []
  };
}

test('workforce policy values are bounded and boolean settings are normalised', () => {
  assert.deepEqual(normaliseWorkforceSettings({ supervisionFrequencyDays: 2, appraisalFrequencyDays: 9999, requireStaffAcknowledgement: 'false' }), {
    supervisionFrequencyDays: 7,
    newStarterSupervisionDays: 7,
    appraisalFrequencyDays: 730,
    expiryWarningDays: 60,
    probationReviewDays: 90,
    requireStaffAcknowledgement: false,
    blockExpiredCriticalCompetencies: true
  });
});

test('training requirements apply to the staff role scope', () => {
  assert.deepEqual(staffRoleScopes(staff), ['all', 'care']);
  assert.equal(trainingApplies(catalogue[0], staff), true);
  assert.equal(trainingApplies(catalogue[1], staff), true);
  assert.equal(trainingApplies(catalogue[2], staff), false);
});

test('a complete staff file reports ready without an allocation restriction', () => {
  const readiness = calculateStaffReadiness(staff, completeRecords(), {}, now);
  assert.equal(readiness.readinessStatus, 'ready');
  assert.equal(readiness.overall, 100);
  assert.equal(readiness.training.required, 2);
  assert.equal(readiness.training.overdue, 0);
  assert.equal(readiness.supervision.overdue, false);
  assert.equal(readiness.appraisal.overdue, false);
  assert.equal(readiness.allocationRestricted, false);
});

test('missing critical training restricts allocation and appears in the dashboard', () => {
  const records = completeRecords();
  records.training = records.training.filter(row => row.training_catalog_id !== 'meds');
  const readiness = calculateStaffReadiness(staff, records, {}, now);
  assert.equal(readiness.readinessStatus, 'restricted');
  assert.equal(readiness.training.criticalOverdue, 1);
  assert.equal(readiness.allocationRestricted, true);
  const overview = calculateWorkforceOverview([staff], { 'staff-one': records }, {}, now);
  assert.equal(overview.metrics.restricted, 1);
  assert.equal(overview.metrics.trainingOverdue, 1);
});

test('overdue supervision and incomplete recruitment produce management actions', () => {
  const records = completeRecords();
  records.supervisions = [{ status: 'completed', completed_at: '2026-01-01' }];
  records.recruitment = records.recruitment.filter(row => row.check_type !== 'right_to_work');
  const readiness = calculateStaffReadiness(staff, records, { supervision_frequency_days: 30 }, now);
  assert.equal(readiness.supervision.overdue, true);
  assert.deepEqual(readiness.recruitment.missing, ['right_to_work']);
  assert.equal(readiness.readinessStatus, 'attention');
});

test('supervision actions are bounded, cleaned and invalid actions are ignored', () => {
  assert.deepEqual(normaliseSupervisionActions([{ action: ' Renew medication competency ', owner: 'Manager', dueDate: '2026-09-01', status: 'open' }, { action: '   ' }]), [{
    id: 'action-1',
    action: 'Renew medication competency',
    owner: 'Manager',
    dueDate: '2026-09-01',
    status: 'open',
    completedAt: ''
  }]);
});

