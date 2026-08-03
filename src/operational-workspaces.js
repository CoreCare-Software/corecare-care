function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function percentage(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 100) : 100;
}

function activeValue(value) {
  return ['active', 'open', 'scheduled', 'in_progress'].includes(String(value || '').toLowerCase());
}

export function visitLiveStatus(visit, now = new Date()) {
  const status = String(visit?.status || 'scheduled').toLowerCase();
  if (['completed', 'cancelled', 'missed'].includes(status)) return status;
  const start = new Date(visit?.scheduled_start || '').getTime();
  const end = new Date(visit?.scheduled_end || visit?.scheduled_start || '').getTime();
  const clock = now.getTime();
  if (status === 'in_progress' && Number.isFinite(end) && end < clock) return 'overrunning';
  if (status === 'scheduled' && Number.isFinite(start) && start + (15 * 60 * 1000) < clock) return 'late';
  if (status === 'scheduled' && Number.isFinite(start) && Math.abs(start - clock) <= (15 * 60 * 1000)) return 'due';
  return status;
}

export function assessRotaPublication(visits = []) {
  const draft = visits.filter(visit => String(visit.rota_status || 'published').toLowerCase() === 'draft' && String(visit.status || '').toLowerCase() !== 'cancelled');
  const unallocated = draft.filter(visit => !visit.staff_id);
  const travelConflicts = draft.filter(visit => Number(visit.travel_conflict) === 1 && Number(visit.travel_override) !== 1);
  const invalidTimes = draft.filter(visit => {
    const start = new Date(visit.scheduled_start || '').getTime();
    const end = new Date(visit.scheduled_end || '').getTime();
    return !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
  });
  const blockers = [];
  if (unallocated.length) blockers.push(`${unallocated.length} draft visit${unallocated.length === 1 ? '' : 's'} still need a care worker`);
  if (travelConflicts.length) blockers.push(`${travelConflicts.length} draft visit${travelConflicts.length === 1 ? ' has' : 's have'} an unresolved travel conflict`);
  if (invalidTimes.length) blockers.push(`${invalidTimes.length} draft visit${invalidTimes.length === 1 ? ' has' : 's have'} an invalid start or end time`);
  return {
    draft: draft.length,
    allocated: draft.length - unallocated.length,
    unallocated: unallocated.length,
    travelConflicts: travelConflicts.length,
    invalidTimes: invalidTimes.length,
    ready: draft.length > 0 && blockers.length === 0,
    blockers
  };
}

export function normaliseFamilyAccess(input = {}) {
  const enabled = (value, fallback) => value === undefined ? fallback : [true, 1, '1', 'true', 'on'].includes(value);
  return {
    canViewProfile: enabled(input.canViewProfile, true),
    canViewVisits: enabled(input.canViewVisits, true),
    canViewCareUpdates: enabled(input.canViewCareUpdates, true),
    canViewDocuments: enabled(input.canViewDocuments, false),
    canViewMedication: enabled(input.canViewMedication, false)
  };
}

export function calculateLiveDashboard(input = {}, now = new Date()) {
  const clients = Array.isArray(input.clients) ? input.clients : [];
  const staff = Array.isArray(input.staff) ? input.staff : [];
  const plans = Array.isArray(input.plans) ? input.plans : [];
  const risks = Array.isArray(input.risks) ? input.risks : [];
  const visits = Array.isArray(input.visits) ? input.visits : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const incidents = Array.isArray(input.incidents) ? input.incidents : [];
  const today = dayKey(now);
  const in30 = dayKey(new Date(now.getTime() + (30 * 86400000)));
  const clock = now.getTime();

  const activeClients = clients.filter(row => String(row.status).toLowerCase() === 'active');
  const activeStaff = staff.filter(row => String(row.status).toLowerCase() === 'active');
  const activePlans = plans.filter(row => String(row.status).toLowerCase() === 'active');
  const activeRisks = risks.filter(row => activeValue(row.status));
  const liveVisits = visits
    .filter(row => String(row.status).toLowerCase() !== 'cancelled' && String(row.rota_status || 'published').toLowerCase() !== 'cancelled')
    .map(row => ({ ...row, live_status: visitLiveStatus(row, now) }))
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));

  const reviewsDue = activeClients.filter(row => row.next_review && row.next_review < today);
  const highRiskClients = activeClients.filter(row => String(row.risk).toLowerCase() === 'high');
  const complianceStaff = activeStaff.filter(row =>
    !row.dbs_expiry || row.dbs_expiry < today || !row.training_expiry || row.training_expiry < today
  );
  const plansDue = activePlans.filter(row => row.review_date && row.review_date <= in30);
  const overduePlans = activePlans.filter(row => row.review_date && row.review_date < today);
  const highRisks = activeRisks.filter(row => ['high', 'critical'].includes(String(row.severity).toLowerCase()));
  const overdueTasks = tasks.filter(row => !['completed', 'closed', 'cancelled'].includes(String(row.status).toLowerCase()) && row.due_at && new Date(row.due_at).getTime() < clock);
  const highIncidents = incidents.filter(row => String(row.status).toLowerCase() !== 'closed' && ['high', 'critical'].includes(String(row.severity).toLowerCase()));

  const completed = liveVisits.filter(row => row.live_status === 'completed').length;
  const inProgress = liveVisits.filter(row => row.live_status === 'in_progress').length;
  const late = liveVisits.filter(row => ['late', 'overrunning'].includes(row.live_status)).length;
  const unallocated = liveVisits.filter(row => !row.staff_id && !['completed', 'cancelled'].includes(row.live_status)).length;
  const draft = liveVisits.filter(row => String(row.rota_status || 'published').toLowerCase() === 'draft').length;
  const remaining = Math.max(0, liveVisits.length - completed);

  const trainingScore = percentage(activeStaff.filter(row => row.training_expiry && row.training_expiry >= today).length, activeStaff.length);
  const staffChecksScore = percentage(activeStaff.filter(row => row.dbs_expiry && row.dbs_expiry >= today && row.training_expiry && row.training_expiry >= today).length, activeStaff.length);
  const carePlanScore = percentage(activePlans.filter(row => row.review_date && row.review_date >= today).length, activePlans.length);
  const overallCompliance = Math.round((trainingScore + staffChecksScore + carePlanScore) / 3);

  const priorities = [];
  const addPriority = (key, title, detail, tone, page) => priorities.push({ key, title, detail, tone, page });
  if (late) addPriority('late-visits', `${late} visit${late === 1 ? '' : 's'} running late`, 'Open live visits and coordinate immediate cover or support.', 'danger', 'visits');
  if (unallocated) addPriority('unallocated-visits', `${unallocated} visit${unallocated === 1 ? '' : 's'} unallocated today`, 'Assign a care worker before the visit becomes due.', 'warning', 'rota');
  if (draft) addPriority('draft-rota', `${draft} draft rota change${draft === 1 ? '' : 's'}`, 'Review allocations and publish the rota when it is safe.', 'warning', 'rota');
  if (overdueTasks.length) addPriority('overdue-tasks', `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`, 'Review ownership, due dates and escalation.', 'danger', 'tasks');
  if (highIncidents.length) addPriority('high-incidents', `${highIncidents.length} high-priority incident${highIncidents.length === 1 ? '' : 's'}`, 'Manager review is still outstanding.', 'danger', 'incidents');
  if (overduePlans.length) addPriority('care-plans', `${overduePlans.length} care-plan review${overduePlans.length === 1 ? '' : 's'} overdue`, 'Open the clinical review queue.', 'warning', 'care');
  if (reviewsDue.length) addPriority('client-reviews', `${reviewsDue.length} client review${reviewsDue.length === 1 ? '' : 's'} overdue`, 'Check the client review schedule.', 'warning', 'clients');
  if (complianceStaff.length) addPriority('staff-compliance', `${complianceStaff.length} staff compliance record${complianceStaff.length === 1 ? '' : 's'} need attention`, 'DBS, training or expiry information is missing or overdue.', 'warning', 'staff');
  if (highRisks.length) addPriority('risks', `${highRisks.length} active high-risk assessment${highRisks.length === 1 ? '' : 's'}`, 'Review controls and planned actions.', 'danger', 'care');

  const metrics = {
    activeClients: activeClients.length,
    reviewsDue: reviewsDue.length,
    highRisk: highRiskClients.length,
    activeStaff: activeStaff.length,
    totalStaff: staff.length,
    complianceDue: complianceStaff.length,
    carePlansDue: plansDue.length,
    activeRisks: highRisks.length
  };
  return {
    metrics,
    today: {
      total: liveVisits.length,
      completed,
      inProgress,
      late,
      unallocated,
      draft,
      remaining,
      completionPercent: percentage(completed, liveVisits.length),
      visits: liveVisits.slice(0, 12)
    },
    compliance: { overall: overallCompliance, training: trainingScore, carePlans: carePlanScore, staffChecks: staffChecksScore },
    priorities: priorities.slice(0, 8),
    briefing: {
      headline: priorities.length ? `${priorities.length} management priorit${priorities.length === 1 ? 'y' : 'ies'} need attention.` : 'Today\'s care operation is on track.',
      detail: liveVisits.length ? `${completed} of ${liveVisits.length} visits are complete; ${remaining} remain in today\'s service day.` : 'There are no visits scheduled in the current service day.'
    }
  };
}
