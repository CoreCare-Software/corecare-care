const dayKey = value => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};

const safeJsonArray = value => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const inDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return dayKey(next);
};

const percent = (completed, total) => total ? Math.round((completed / total) * 100) : 100;

export function normaliseWorkforceSettings(input = {}) {
  const bounded = (value, fallback, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || fallback));
  return {
    supervisionFrequencyDays: bounded(input.supervisionFrequencyDays ?? input.supervision_frequency_days, 30, 7, 365),
    newStarterSupervisionDays: bounded(input.newStarterSupervisionDays ?? input.new_starter_supervision_days, 7, 1, 90),
    appraisalFrequencyDays: bounded(input.appraisalFrequencyDays ?? input.appraisal_frequency_days, 365, 30, 730),
    expiryWarningDays: bounded(input.expiryWarningDays ?? input.expiry_warning_days, 60, 7, 365),
    probationReviewDays: bounded(input.probationReviewDays ?? input.probation_review_days, 90, 7, 365),
    requireStaffAcknowledgement: ![false, 0, '0', 'false', 'off'].includes(input.requireStaffAcknowledgement ?? input.require_staff_acknowledgement),
    blockExpiredCriticalCompetencies: ![false, 0, '0', 'false', 'off'].includes(input.blockExpiredCriticalCompetencies ?? input.block_expired_critical_competencies)
  };
}

export function staffRoleScopes(staff = {}) {
  const text = `${staff.job_title || staff.jobTitle || ''} ${staff.employment_type || staff.employmentType || ''}`.toLowerCase();
  const scopes = new Set(['all']);
  if (/carer|care worker|support worker|nurse|clinical|senior/.test(text)) scopes.add('care');
  if (/nurse|clinical/.test(text)) scopes.add('clinical');
  if (/manager|owner|lead|director/.test(text)) scopes.add('management');
  if (/office|administrator|coordinator|scheduler|finance/.test(text)) scopes.add('office');
  return [...scopes];
}

export function trainingApplies(catalogueItem, staff) {
  if (!catalogueItem || Number(catalogueItem.active ?? 1) !== 1) return false;
  const requiredScopes = safeJsonArray(catalogueItem.role_scope_json || catalogueItem.roleScope || ['all']);
  if (!requiredScopes.length || requiredScopes.includes('all')) return true;
  const staffScopes = staffRoleScopes(staff);
  return requiredScopes.some(scope => staffScopes.includes(String(scope).toLowerCase()));
}

const currentRecord = (record, today) => {
  const status = String(record?.status || '').toLowerCase();
  if (['exempt', 'not_required'].includes(status)) return true;
  if (!['completed', 'verified', 'current', 'competent', 'observed'].includes(status)) return false;
  const expiry = record.expiry_date || record.next_review_date || '';
  return !expiry || expiry >= today;
};

const lastCompletedDate = rows => rows
  .filter(row => String(row.status).toLowerCase() === 'completed')
  .map(row => row.completed_at || row.completed_date || row.scheduled_at)
  .filter(Boolean)
  .sort()
  .at(-1) || '';

export function calculateStaffReadiness(staff = {}, records = {}, rawSettings = {}, now = new Date()) {
  const settings = normaliseWorkforceSettings(rawSettings);
  const today = dayKey(now);
  const warningDate = inDays(now, settings.expiryWarningDays);
  const recruitment = records.recruitment || [];
  const employmentHistory = records.employmentHistory || records.employment_history || [];
  const supervisions = records.supervisions || [];
  const catalogue = records.trainingCatalogue || records.training_catalogue || [];
  const training = records.training || [];
  const competencies = records.competencies || [];
  const appraisals = records.appraisals || [];
  const qualifications = records.qualifications || [];
  const documents = records.documents || [];

  const verifiedTypes = type => recruitment.filter(row => row.check_type === type && currentRecord(row, today));
  const recruitmentChecks = [
    { key: 'identity', ready: verifiedTypes('identity').length > 0 },
    { key: 'right_to_work', ready: verifiedTypes('right_to_work').length > 0 },
    { key: 'dbs', ready: verifiedTypes('dbs').length > 0 },
    { key: 'references', ready: verifiedTypes('reference').length >= 2 },
    { key: 'employment_history', ready: employmentHistory.length > 0 && employmentHistory.every(row => Number(row.verified) === 1) }
  ];

  const applicableTraining = catalogue.filter(item => trainingApplies(item, staff) && item.requirement_level !== 'optional');
  const trainingState = applicableTraining.map(item => {
    const record = training.find(row => row.training_catalog_id === item.id);
    const ready = Boolean(record && currentRecord(record, today));
    return { id: item.id, name: item.name, critical: Boolean(item.critical_for_allocation), ready, record: record || null };
  });
  const trainingOverdue = trainingState.filter(item => !item.ready);
  const criticalTrainingOverdue = trainingOverdue.filter(item => item.critical);
  const trainingExpiring = trainingState.filter(item => item.ready && item.record?.expiry_date && item.record.expiry_date <= warningDate);

  const expiredCompetencies = competencies.filter(row => ['expired', 'restricted', 'development_required'].includes(String(row.status).toLowerCase()) || (row.expiry_date && row.expiry_date < today));
  const criticalCompetencies = expiredCompetencies.filter(row => Number(row.critical_for_allocation) === 1);
  const qualificationsDue = qualifications.filter(row => String(row.status).toLowerCase() !== 'archived' && row.expiry_date && row.expiry_date <= warningDate);
  const documentsDue = documents.filter(row => String(row.status).toLowerCase() === 'current' && row.expiry_date && row.expiry_date <= warningDate);

  const startDate = staff.start_date || staff.startDate || '';
  const newStarterCutoff = inDays(now, -settings.probationReviewDays);
  const frequency = startDate && startDate >= newStarterCutoff ? settings.newStarterSupervisionDays : Number(staff.supervision_frequency_days) || settings.supervisionFrequencyDays;
  const lastSupervision = lastCompletedDate(supervisions);
  const calculatedSupervisionDue = lastSupervision ? inDays(lastSupervision, frequency) : (startDate ? inDays(startDate, frequency) : today);
  const supervisionDue = staff.next_supervision_date || calculatedSupervisionDue;
  const plannedSupervision = supervisions.find(row => row.status === 'planned' && row.scheduled_at && dayKey(row.scheduled_at) >= today);
  const supervisionOverdue = !plannedSupervision && Boolean(supervisionDue && supervisionDue < today);

  const lastAppraisal = lastCompletedDate(appraisals);
  const calculatedAppraisalDue = lastAppraisal ? inDays(lastAppraisal, settings.appraisalFrequencyDays) : (startDate ? inDays(startDate, settings.appraisalFrequencyDays) : today);
  const appraisalDue = staff.next_appraisal_date || calculatedAppraisalDue;
  const plannedAppraisal = appraisals.find(row => row.status === 'planned' && row.scheduled_at && dayKey(row.scheduled_at) >= today);
  const appraisalOverdue = !plannedAppraisal && Boolean(appraisalDue && appraisalDue < today);

  const scores = {
    recruitment: percent(recruitmentChecks.filter(item => item.ready).length, recruitmentChecks.length),
    training: percent(trainingState.filter(item => item.ready).length, trainingState.length),
    competencies: percent(competencies.length - expiredCompetencies.length, competencies.length),
    supervision: supervisionOverdue ? 0 : 100,
    appraisal: appraisalOverdue ? 0 : 100
  };
  const overall = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length);
  const allocationRestricted = settings.blockExpiredCriticalCompetencies && (criticalTrainingOverdue.length > 0 || criticalCompetencies.length > 0);
  const attention = recruitmentChecks.filter(item => !item.ready).length + trainingOverdue.length + expiredCompetencies.length + Number(supervisionOverdue) + Number(appraisalOverdue);
  const readinessStatus = allocationRestricted ? 'restricted' : attention ? 'attention' : 'ready';

  return {
    overall,
    scores,
    readinessStatus,
    allocationRestricted,
    recruitment: {
      complete: recruitmentChecks.filter(item => item.ready).length,
      total: recruitmentChecks.length,
      missing: recruitmentChecks.filter(item => !item.ready).map(item => item.key)
    },
    training: {
      complete: trainingState.filter(item => item.ready).length,
      required: trainingState.length,
      overdue: trainingOverdue.length,
      criticalOverdue: criticalTrainingOverdue.length,
      expiring: trainingExpiring.length,
      items: trainingState
    },
    competencies: {
      total: competencies.length,
      attention: expiredCompetencies.length,
      critical: criticalCompetencies.length
    },
    supervision: { lastCompleted: lastSupervision, dueDate: supervisionDue, overdue: supervisionOverdue, planned: plannedSupervision?.scheduled_at || '' },
    appraisal: { lastCompleted: lastAppraisal, dueDate: appraisalDue, overdue: appraisalOverdue, planned: plannedAppraisal?.scheduled_at || '' },
    qualificationsDue: qualificationsDue.length,
    documentsDue: documentsDue.length,
    attention
  };
}

export function calculateWorkforceOverview(staffRows = [], recordsByStaff = {}, settings = {}, now = new Date()) {
  const active = staffRows.filter(row => String(row.status).toLowerCase() === 'active');
  const staff = staffRows.map(row => ({
    ...row,
    readiness: calculateStaffReadiness(row, recordsByStaff[row.id] || {}, settings, now)
  }));
  const activeWithReadiness = staff.filter(row => String(row.status).toLowerCase() === 'active');
  return {
    staff,
    metrics: {
      total: staff.length,
      active: active.length,
      ready: activeWithReadiness.filter(row => row.readiness.readinessStatus === 'ready').length,
      attention: activeWithReadiness.filter(row => row.readiness.readinessStatus === 'attention').length,
      restricted: activeWithReadiness.filter(row => row.readiness.readinessStatus === 'restricted').length,
      supervisionsOverdue: activeWithReadiness.filter(row => row.readiness.supervision.overdue).length,
      trainingOverdue: activeWithReadiness.reduce((sum, row) => sum + row.readiness.training.overdue, 0),
      appraisalsOverdue: activeWithReadiness.filter(row => row.readiness.appraisal.overdue).length,
      recruitmentIncomplete: activeWithReadiness.filter(row => row.readiness.recruitment.missing.length).length,
      averageReadiness: activeWithReadiness.length ? Math.round(activeWithReadiness.reduce((sum, row) => sum + row.readiness.overall, 0) / activeWithReadiness.length) : 100
    }
  };
}

export function normaliseSupervisionActions(value) {
  const input = safeJsonArray(value);
  return input.slice(0, 20).map((item, index) => ({
    id: String(item?.id || `action-${index + 1}`).slice(0, 80),
    action: String(item?.action || '').trim().slice(0, 1000),
    owner: String(item?.owner || '').trim().slice(0, 160),
    dueDate: dayKey(item?.dueDate || item?.due_date || ''),
    status: ['open', 'completed', 'cancelled'].includes(item?.status) ? item.status : 'open',
    completedAt: item?.completedAt || item?.completed_at || ''
  })).filter(item => item.action);
}

