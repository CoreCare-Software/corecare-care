const MINUTE = 60_000;
const DAY = 86_400_000;

const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const time = value => {
  const result = new Date(value || '').getTime();
  return Number.isFinite(result) ? result : null;
};
const clientName = row => clean(row.client_name || row.clientName || row.preferred_name || row.preferredName) || 'Client';
const staffName = row => clean(row.staff_name || row.staffName) || 'Unallocated';
const severityScore = severity => ({ critical: 3, warning: 2, information: 1 })[severity] || 0;

function operationalSeverity(value, fallback = 'warning') {
  const severity = lower(value);
  return ['critical', 'high'].includes(severity) ? 'critical' : ['medium', 'warning'].includes(severity) ? 'warning' : fallback;
}

export function buildManagerAlerts(input = {}, now = new Date()) {
  const clock = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const alerts = new Map();
  const add = alert => {
    if (!alert.key || !alert.sourceId) return;
    const normalised = {
      ...alert,
      severity: operationalSeverity(alert.severity),
      title: clean(alert.title),
      message: clean(alert.message),
      page: clean(alert.page) || 'operations',
      occurredAt: clean(alert.occurredAt) || null,
      dueAt: clean(alert.dueAt) || null,
      branchId: clean(alert.branchId) || null,
      requiresPrompt: alert.requiresPrompt !== false,
      persistent: true
    };
    const existing = alerts.get(normalised.key);
    if (!existing || severityScore(normalised.severity) > severityScore(existing.severity)) alerts.set(normalised.key, normalised);
  };

  for (const incident of input.incidents || []) {
    if (['closed', 'cancelled'].includes(lower(incident.status))) continue;
    const severity = operationalSeverity(incident.severity);
    const safeguarding = Number(incident.safeguarding_required || incident.safeguardingRequired) === 1;
    const finalSeverity = safeguarding ? 'critical' : severity;
    const reference = clean(incident.reference_number || incident.referenceNumber);
    add({
      key: `incident:${incident.id}:${finalSeverity}`,
      category: 'Incident', severity: finalSeverity,
      title: `${safeguarding ? 'Safeguarding ' : ''}${finalSeverity === 'critical' ? 'urgent ' : ''}incident${reference ? ` ${reference}` : ''}`,
      message: `${clientName(incident)} · ${clean(incident.title) || 'Incident awaiting management review'} · ${clean(incident.status) || 'open'}`,
      page: 'incidents', sourceType: 'incident', sourceId: clean(incident.id),
      occurredAt: incident.occurred_at || incident.created_at, dueAt: incident.investigation_due_at,
      branchId: incident.branch_id
    });
  }

  for (const visit of input.visits || []) {
    const status = lower(visit.status) || 'scheduled';
    if (['cancelled', 'completed'].includes(status)) continue;
    const start = time(visit.scheduled_start || visit.scheduledStart);
    const end = time(visit.scheduled_end || visit.scheduledEnd);
    if (status === 'missed') {
      add({
        key: `visit:missed:${visit.id}:critical`, category: 'Missed visit', severity: 'critical',
        title: `Missed visit · ${clientName(visit)}`,
        message: `${clean(visit.visit_type || visit.visitType) || 'Care visit'} was due ${clean(visit.scheduled_start || visit.scheduledStart)} · ${staffName(visit)}`,
        page: 'visits', sourceType: 'visit', sourceId: clean(visit.id), occurredAt: visit.scheduled_start || visit.scheduledStart,
        dueAt: visit.scheduled_start || visit.scheduledStart, branchId: visit.branch_id
      });
      continue;
    }
    if (status === 'scheduled' && start !== null && start + 15 * MINUTE < clock) {
      const minutesLate = Math.max(16, Math.floor((clock - start) / MINUTE));
      const severity = minutesLate >= 30 ? 'critical' : 'warning';
      add({
        key: `visit:late:${visit.id}:${severity}`, category: 'Late arrival', severity,
        title: `${minutesLate} minutes late · ${clientName(visit)}`,
        message: `${clean(visit.visit_type || visit.visitType) || 'Care visit'} has not started · ${staffName(visit)}`,
        page: 'visits', sourceType: 'visit', sourceId: clean(visit.id), occurredAt: visit.scheduled_start || visit.scheduledStart,
        dueAt: visit.scheduled_start || visit.scheduledStart, branchId: visit.branch_id
      });
      continue;
    }
    if (status === 'in_progress' && end !== null && end + 15 * MINUTE < clock) {
      const minutesOver = Math.max(16, Math.floor((clock - end) / MINUTE));
      const severity = minutesOver >= 30 ? 'critical' : 'warning';
      add({
        key: `visit:overrunning:${visit.id}:${severity}`, category: 'Overrunning visit', severity,
        title: `${minutesOver} minutes over · ${clientName(visit)}`,
        message: `${clean(visit.visit_type || visit.visitType) || 'Care visit'} is still in progress · ${staffName(visit)}`,
        page: 'visits', sourceType: 'visit', sourceId: clean(visit.id), occurredAt: visit.scheduled_end || visit.scheduledEnd,
        dueAt: visit.scheduled_end || visit.scheduledEnd, branchId: visit.branch_id
      });
      continue;
    }
    if (status === 'scheduled' && !clean(visit.staff_id || visit.staffId) && start !== null && start <= clock + 2 * 60 * MINUTE) {
      const minutesUntil = Math.floor((start - clock) / MINUTE);
      const severity = minutesUntil <= 30 ? 'critical' : 'warning';
      add({
        key: `visit:unallocated:${visit.id}:${severity}`, category: 'Unallocated visit', severity,
        title: `Unallocated visit · ${clientName(visit)}`,
        message: minutesUntil <= 0 ? 'This published visit is due now and has no care worker.' : `This published visit starts in ${minutesUntil} minutes and has no care worker.`,
        page: 'rota', sourceType: 'visit', sourceId: clean(visit.id), occurredAt: visit.scheduled_start || visit.scheduledStart,
        dueAt: visit.scheduled_start || visit.scheduledStart, branchId: visit.branch_id
      });
    }
  }

  for (const task of input.tasks || []) {
    if (['completed', 'closed', 'cancelled'].includes(lower(task.status))) continue;
    const due = time(task.due_at || task.dueAt);
    if (due === null || due >= clock) continue;
    const severity = ['high', 'critical'].includes(lower(task.priority)) ? 'critical' : 'warning';
    add({
      key: `task:overdue:${task.id}:${severity}`, category: 'Overdue task', severity,
      title: `Overdue task · ${clean(task.title) || 'Management action'}`,
      message: `${clientName(task)} · priority ${clean(task.priority) || 'normal'}`,
      page: 'tasks', sourceType: 'task', sourceId: clean(task.id), occurredAt: task.created_at,
      dueAt: task.due_at || task.dueAt, branchId: task.branch_id
    });
  }

  for (const careAlert of input.careAlerts || []) {
    if (lower(careAlert.status) && lower(careAlert.status) !== 'open') continue;
    const severity = operationalSeverity(careAlert.severity);
    add({
      key: `care:${careAlert.id}:${severity}`, category: 'Care governance', severity,
      title: clean(careAlert.title) || 'Care record requires management review',
      message: `${clientName(careAlert)}${clean(careAlert.message) ? ` · ${clean(careAlert.message)}` : ''}`,
      page: 'care', sourceType: 'care_alert', sourceId: clean(careAlert.id), occurredAt: careAlert.created_at,
      dueAt: careAlert.due_date, branchId: careAlert.branch_id
    });
  }

  for (const medication of input.medications || []) {
    if (lower(medication.status) !== 'active' || medication.stock_quantity === null || medication.stock_quantity === undefined) continue;
    const stock = Number(medication.stock_quantity);
    const threshold = Number(medication.low_stock_threshold ?? 5);
    if (!Number.isFinite(stock) || !Number.isFinite(threshold) || stock > threshold) continue;
    const severity = stock <= 0 ? 'critical' : 'warning';
    add({
      key: `medication:stock:${medication.id}:${severity}`, category: 'Medication stock', severity,
      title: `${stock <= 0 ? 'No' : 'Low'} stock · ${clean(medication.name) || 'Medication'}`,
      message: `${clientName(medication)} · ${stock} ${clean(medication.stock_unit) || 'units'} remaining`,
      page: 'medication', sourceType: 'medication', sourceId: clean(medication.id),
      occurredAt: medication.updated_at, branchId: medication.branch_id
    });
  }

  for (const administration of input.medicationExceptions || []) {
    if (Number(administration.is_void) === 1 || !['refused', 'omitted', 'unavailable', 'missed'].includes(lower(administration.outcome))) continue;
    const severity = ['omitted', 'missed', 'unavailable'].includes(lower(administration.outcome)) ? 'critical' : 'warning';
    add({
      key: `medication:exception:${administration.id}:${severity}`, category: 'Medication exception', severity,
      title: `${clean(administration.medication_name) || 'Medication'} · ${lower(administration.outcome)}`,
      message: `${clientName(administration)} · ${clean(administration.reason) || 'Manager follow-up required'}`,
      page: 'medication', sourceType: 'medication_administration', sourceId: clean(administration.id),
      occurredAt: administration.administered_at, branchId: administration.branch_id
    });
  }

  for (const review of input.accessReviews || []) {
    const due = time(review.next_review_date ? `${review.next_review_date}T23:59:59Z` : null);
    if (due === null || due >= clock || lower(review.status) !== 'active') continue;
    const daysOverdue = Math.max(1, Math.floor((clock - due) / DAY));
    const severity = daysOverdue >= 30 ? 'critical' : 'warning';
    add({
      key: `access-review:${review.user_id || review.id}:${severity}`, category: 'Access governance', severity,
      title: `Access review overdue · ${clean(review.display_name) || 'User'}`,
      message: `${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue · ${clean(review.access_level).replaceAll('_', ' ')}`,
      page: 'settings', sourceType: 'user_access_review', sourceId: clean(review.user_id || review.id),
      dueAt: review.next_review_date, branchId: review.home_branch_id
    });
  }

  return [...alerts.values()].sort((a, b) =>
    severityScore(b.severity) - severityScore(a.severity)
    || String(a.dueAt || a.occurredAt || '').localeCompare(String(b.dueAt || b.occurredAt || ''))
    || a.title.localeCompare(b.title)
  );
}

export function attachManagerAlertAcknowledgements(alerts = [], receipts = []) {
  const byKey = new Map(receipts.map(row => [clean(row.alert_key || row.alertKey), row]));
  return alerts.map(alert => {
    const receipt = byKey.get(alert.key);
    return {
      ...alert,
      acknowledged: Boolean(receipt?.acknowledged_at || receipt?.acknowledgedAt),
      acknowledgedAt: receipt?.acknowledged_at || receipt?.acknowledgedAt || null
    };
  });
}

export function managerAlertSummary(alerts = []) {
  return {
    total: alerts.length,
    critical: alerts.filter(alert => alert.severity === 'critical').length,
    warning: alerts.filter(alert => alert.severity === 'warning').length,
    unacknowledged: alerts.filter(alert => !alert.acknowledged).length,
    prompt: alerts.filter(alert => alert.requiresPrompt && !alert.acknowledged).length
  };
}

