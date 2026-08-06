import test from 'node:test';
import assert from 'node:assert/strict';
import { attachManagerAlertAcknowledgements, buildManagerAlerts, managerAlertSummary } from '../src/manager-alerts.js';

const now = new Date('2026-08-06T12:00:00Z');

test('manager alerts cover urgent care-company operational exceptions', () => {
  const alerts = buildManagerAlerts({
    incidents: [{ id: 'inc-1', severity: 'medium', status: 'open', safeguarding_required: 1, reference_number: 'INC-1', title: 'Safeguarding concern', client_name: 'Alex Client' }],
    visits: [
      { id: 'missed-1', status: 'missed', scheduled_start: '2026-08-06T10:00:00Z', client_name: 'Missed Client', staff_name: 'Care Worker' },
      { id: 'late-1', status: 'scheduled', scheduled_start: '2026-08-06T11:40:00Z', client_name: 'Late Client', staff_id: 'staff-1', staff_name: 'Care Worker' },
      { id: 'overrun-1', status: 'in_progress', scheduled_start: '2026-08-06T10:00:00Z', scheduled_end: '2026-08-06T11:20:00Z', client_name: 'Overrun Client', staff_id: 'staff-2', staff_name: 'Senior Carer' },
      { id: 'unallocated-1', status: 'scheduled', scheduled_start: '2026-08-06T12:20:00Z', client_name: 'Unallocated Client' }
    ],
    tasks: [{ id: 'task-1', status: 'open', priority: 'high', due_at: '2026-08-06T11:00:00Z', title: 'Medication follow-up', client_name: 'Task Client' }],
    careAlerts: [{ id: 'care-1', status: 'open', severity: 'warning', title: 'Care plan review overdue', client_name: 'Plan Client' }],
    medications: [{ id: 'med-1', status: 'active', name: 'Medicine', stock_quantity: 0, low_stock_threshold: 5, stock_unit: 'tablets', client_name: 'Medication Client' }],
    medicationExceptions: [{ id: 'mar-1', outcome: 'omitted', medication_name: 'Medicine', reason: 'Unavailable', administered_at: '2026-08-06T09:00:00Z', client_name: 'Medication Client' }],
    accessReviews: [{ user_id: 'user-1', display_name: 'Manager User', access_level: 'organisation_admin', status: 'active', next_review_date: '2026-08-05' }],
    visitExceptions: [{ id: 'exception-1', status: 'open', severity: 'critical', exception_type: 'short_team', summary: 'Double-handed visit has only one care worker.', client_name: 'Team Client' }],
    qualityActions: [{ id: 'action-1', status: 'open', priority: 'high', title: 'Complete audit action', action_required: 'Review and evidence the corrective action.', due_at: '2026-08-05T12:00:00Z' }],
    feedbackCases: [{ id: 'feedback-1', status: 'open', risk_level: 'critical', case_type: 'complaint', case_reference: 'FB-1', summary: 'Urgent complaint', response_due_at: '2026-08-05T12:00:00Z' }]
  }, now);

  const categories = new Set(alerts.map(alert => alert.category));
  for (const category of ['Incident', 'Missed visit', 'Late arrival', 'Overrunning visit', 'Unallocated visit', 'Overdue task', 'Care governance', 'Medication stock', 'Medication exception', 'Access governance', 'Visit exception', 'Quality action', 'Feedback and complaints']) {
    assert.ok(categories.has(category), `missing ${category}`);
  }
  assert.equal(alerts.find(alert => alert.sourceId === 'inc-1').severity, 'critical');
  assert.equal(alerts.find(alert => alert.sourceId === 'missed-1').severity, 'critical');
  assert.equal(alerts.find(alert => alert.sourceId === 'late-1').severity, 'warning');
  assert.equal(alerts.find(alert => alert.sourceId === 'med-1').page, 'medication');
  assert.ok(alerts.every(alert => alert.persistent && alert.requiresPrompt));
});

test('visit alerts escalate and clear when operational state changes', () => {
  const visit = { id: 'visit-1', status: 'scheduled', scheduled_start: '2026-08-06T11:40:00Z', staff_id: 'staff-1', client_name: 'Client' };
  const warning = buildManagerAlerts({ visits: [visit] }, now);
  const critical = buildManagerAlerts({ visits: [{ ...visit, scheduled_start: '2026-08-06T11:20:00Z' }] }, now);
  const completed = buildManagerAlerts({ visits: [{ ...visit, status: 'completed' }] }, now);
  assert.equal(warning[0].severity, 'warning');
  assert.equal(critical[0].severity, 'critical');
  assert.notEqual(warning[0].key, critical[0].key);
  assert.deepEqual(completed, []);
});

test('acknowledgements are per-alert state and do not remove active alerts', () => {
  const active = buildManagerAlerts({ incidents: [{ id: 'inc-2', severity: 'high', status: 'open', title: 'Fall' }] }, now);
  const acknowledged = attachManagerAlertAcknowledgements(active, [{ alert_key: active[0].key, acknowledged_at: '2026-08-06T12:01:00Z' }]);
  assert.equal(acknowledged.length, 1);
  assert.equal(acknowledged[0].acknowledged, true);
  assert.deepEqual(managerAlertSummary(acknowledged), { total: 1, critical: 1, warning: 0, unacknowledged: 0, prompt: 0 });
});
