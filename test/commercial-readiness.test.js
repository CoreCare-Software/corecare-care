import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPrnAdministration,
  assessStaffAllocation,
  assessVisitTeam,
  calculateQualityDashboard,
  medicationDueSlots,
  rollingPrnDose,
  validateCommunicationProfile,
  validateGovernanceRecord,
  validateMedicationSafetyProfile,
} from '../src/commercial-readiness.js';

test('double-handed visits remain blocked until one complete, unique team is allocated', () => {
  const partial = assessVisitTeam({ carers_required: 2 }, [{ staff_id: 'a', assignment_role: 'lead', allocation_status: 'allocated' }]);
  assert.equal(partial.complete, false);
  assert.equal(partial.state, 'partial');
  assert.equal(partial.blockers[0].code, 'CARE_TEAM_INCOMPLETE');
  const ready = assessVisitTeam({ carers_required: 2 }, [
    { staff_id: 'a', assignment_role: 'lead', allocation_status: 'allocated' },
    { staff_id: 'b', assignment_role: 'support', allocation_status: 'allocated' },
  ]);
  assert.equal(ready.complete, true);
  assert.equal(ready.state, 'ready');
});

test('allocation blocks absence, clashes, compliance restrictions and missing capabilities', () => {
  const result = assessStaffAllocation({
    staff: { status: 'Active' }, visit: {}, absent: true, overlap: true, allocationRestricted: true,
    requiredSkills: ['medication', 'moving and handling'], staffSkills: ['medication'],
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(new Set(result.blockers.map(item => item.code)), new Set(['WORKFORCE_RESTRICTED', 'STAFF_ABSENT', 'ROTA_CLASH', 'REQUIRED_SKILLS_MISSING']));
});

test('medication safety requires a complete authorisation and numerical PRN ceiling', () => {
  const base = { name: 'Medicine', strength: '5 mg', form: 'tablet', route: 'oral', dose: 'one tablet', prescriberName: 'Dr Example', authorisationReference: 'RX-1', startDate: '2026-08-01', reviewDate: '2026-09-01', isPrn: true, prnProtocol: 'Only for recorded pain score.', doseUnitsPerAdministration: 1 };
  const incomplete = validateMedicationSafetyProfile(base);
  assert.equal(incomplete.valid, false);
  assert.match(incomplete.missing.join(' '), /24-hour maximum/);
  const complete = validateMedicationSafetyProfile({ ...base, maxDoseUnits24h: 4 });
  assert.equal(complete.valid, true);
});

test('rolling PRN safeguards exclude void entries and block doses over 24-hour maximum', () => {
  const at = new Date('2026-08-06T12:00:00Z');
  const entries = [
    { administered_at: '2026-08-06T08:00:00Z', outcome: 'administered', dose_units: 2, is_void: 0 },
    { administered_at: '2026-08-06T09:00:00Z', outcome: 'administered', dose_units: 10, is_void: 1 },
    { administered_at: '2026-08-05T11:00:00Z', outcome: 'administered', dose_units: 5, is_void: 0 },
  ];
  assert.equal(rollingPrnDose(entries, at), 2);
  assert.equal(assessPrnAdministration({ max_dose_units_24h: 4 }, entries, 2, at).allowed, true);
  assert.equal(assessPrnAdministration({ max_dose_units_24h: 3 }, entries, 2, at).allowed, false);
});

test('scheduled MAR slots use the supplied service wall clock and flag only missing overdue doses', () => {
  const medication = { status: 'active', is_prn: 0, scheduled_times_json: '["08:00","12:00"]', administrations: [{ scheduled_at: '2026-08-06T08:00:00', is_void: 0 }] };
  const slots = medicationDueSlots(medication, '2026-08-06', new Date('2026-08-06T12:45:00Z'), 30);
  assert.equal(slots[0].overdue, false);
  assert.equal(slots[1].overdue, true);
  assert.equal(slots[1].scheduledAt, '2026-08-06T12:00:00');
});

test('governance, accessible information and quality escalation rules surface missing evidence', () => {
  assert.equal(validateGovernanceRecord({ recordType: 'lpa', title: 'Property and finance LPA', decisionScope: 'Finances', outcome: 'Registered', rationale: 'Verified against the registered document.', reviewDate: '2027-08-06' }).valid, true);
  assert.equal(validateCommunicationProfile({ preferredLanguage: 'English', communicationMethod: 'Speech', adjustments: 'Allow extra processing time.', reviewDate: '2027-08-06' }).valid, true);
  const dashboard = calculateQualityDashboard({ actions: [{ id: 'a', title: 'Review medicines', status: 'open', priority: 'critical', due_at: '2026-08-01' }], observations: [{ id: 'o', observation_type: 'oxygen_saturation', escalation_required: 1 }] }, new Date('2026-08-06T12:00:00Z'));
  assert.equal(dashboard.metrics.overdueActions, 1);
  assert.equal(dashboard.metrics.observationEscalations, 1);
  assert.equal(dashboard.priorities.length, 2);
});
