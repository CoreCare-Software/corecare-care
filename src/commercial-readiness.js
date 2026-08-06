const clean = (value, maximum = 10_000) => String(value ?? '').trim().slice(0, maximum);
const present = value => clean(value).length > 0;
const asNumber = value => value === '' || value === null || value === undefined ? null : Number(value);
const validDate = value => present(value) && Number.isFinite(new Date(value).getTime());

export function parseStringList(value, maximum = 50) {
  let source = value;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { source = source.split(','); }
  }
  if (!Array.isArray(source)) return [];
  return [...new Set(source.map(item => clean(item, 120).toLowerCase()).filter(Boolean))].slice(0, maximum);
}

export function assessVisitTeam(visit = {}, assignments = []) {
  const required = Math.max(1, Math.min(4, Number(visit.carers_required ?? visit.carersRequired ?? 1) || 1));
  const active = assignments.filter(row => !['removed', 'declined'].includes(clean(row.allocation_status || row.status, 40).toLowerCase()));
  const staffIds = active.map(row => clean(row.staff_id || row.staffId, 160)).filter(Boolean);
  const blockers = [];
  const warnings = [];
  if (staffIds.length < required) blockers.push({ code: 'CARE_TEAM_INCOMPLETE', message: `${required - staffIds.length} more care worker${required - staffIds.length === 1 ? ' is' : 's are'} required.` });
  if (staffIds.length > required) blockers.push({ code: 'CARE_TEAM_OVERSUBSCRIBED', message: `This visit requires ${required} care worker${required === 1 ? '' : 's'}, but ${staffIds.length} are allocated.` });
  if (new Set(staffIds).size !== staffIds.length) blockers.push({ code: 'DUPLICATE_CARE_WORKER', message: 'The same care worker cannot fill more than one team position.' });
  const leadCount = active.filter(row => clean(row.assignment_role || row.role, 40).toLowerCase() === 'lead').length;
  if (active.length && leadCount !== 1) blockers.push({ code: 'LEAD_CARER_REQUIRED', message: 'Every allocated care team must have exactly one lead care worker.' });
  for (const row of active) {
    const reasons = Array.isArray(row.blockers) ? row.blockers : [];
    for (const reason of reasons) blockers.push(typeof reason === 'string' ? { code: 'STAFF_ALLOCATION_BLOCKED', message: reason, staffId: row.staff_id || row.staffId } : { ...reason, staffId: row.staff_id || row.staffId });
    const cautions = Array.isArray(row.warnings) ? row.warnings : [];
    for (const warning of cautions) warnings.push(typeof warning === 'string' ? { code: 'STAFF_ALLOCATION_WARNING', message: warning, staffId: row.staff_id || row.staffId } : { ...warning, staffId: row.staff_id || row.staffId });
  }
  return { required, assigned: staffIds.length, complete: blockers.length === 0, state: blockers.length ? (staffIds.length ? 'partial' : 'unallocated') : 'ready', blockers, warnings };
}

export function assessStaffAllocation(input = {}) {
  const staff = input.staff || {};
  const visit = input.visit || {};
  const requiredSkills = parseStringList(input.requiredSkills ?? visit.skills_json ?? visit.requiredSkills);
  const staffSkills = new Set(parseStringList(input.staffSkills ?? staff.skills));
  const blockers = [];
  const warnings = [];
  if (clean(staff.status).toLowerCase() !== 'active') blockers.push({ code: 'STAFF_INACTIVE', message: 'This care worker is not active.' });
  if (input.branchMismatch) blockers.push({ code: 'BRANCH_MISMATCH', message: 'This care worker belongs to a different branch.' });
  if (input.allocationRestricted || staff.allocationRestricted || staff.allocation_restricted) blockers.push({ code: 'WORKFORCE_RESTRICTED', message: 'Critical workforce compliance prevents allocation.' });
  if (input.absent) blockers.push({ code: 'STAFF_ABSENT', message: 'An approved or active absence overlaps this visit.' });
  if (input.overlap) blockers.push({ code: 'ROTA_CLASH', message: 'Another visit overlaps this allocation.' });
  if (input.outsideWorkingPattern) blockers.push({ code: 'OUTSIDE_WORKING_PATTERN', message: 'The visit is outside the recorded working pattern.' });
  if (input.travelConflict) blockers.push({ code: 'TRAVEL_CONFLICT', message: 'There is not enough verified travel time between visits.' });
  const missingSkills = requiredSkills.filter(skill => !staffSkills.has(skill));
  if (missingSkills.length) blockers.push({ code: 'REQUIRED_SKILLS_MISSING', message: `Missing required capability: ${missingSkills.join(', ')}.`, skills: missingSkills });
  if (!requiredSkills.length) warnings.push({ code: 'NO_VISIT_SKILLS_RECORDED', message: 'No structured skill requirements are recorded for this visit.' });
  return { allowed: blockers.length === 0, blockers, warnings, requiredSkills, missingSkills };
}

export function validateMedicationSafetyProfile(input = {}) {
  const missing = [];
  const required = [
    ['name', 'medicine name'], ['strength', 'strength'], ['form', 'form'], ['route', 'route'], ['dose', 'dose'],
    ['prescriberName', 'prescriber'], ['authorisationReference', 'authorisation reference'], ['startDate', 'start date'], ['reviewDate', 'review date']
  ];
  for (const [key, label] of required) if (!present(input[key] ?? input[key.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`)])) missing.push(label);
  const schedule = parseStringList(input.scheduledTimes ?? input.scheduled_times_json);
  const isPrn = [true, 1, '1', 'true', 'on'].includes(input.isPrn ?? input.is_prn);
  if (!isPrn && !schedule.length && !present(input.frequency)) missing.push('frequency or scheduled times');
  if (isPrn && !present(input.prnProtocol ?? input.prn_protocol)) missing.push('PRN protocol');
  const units = asNumber(input.doseUnitsPerAdministration ?? input.dose_units_per_administration);
  const maximum = asNumber(input.maxDoseUnits24h ?? input.max_dose_units_24h);
  if (isPrn && (!Number.isFinite(units) || units <= 0)) missing.push('numeric PRN dose units');
  if (isPrn && (!Number.isFinite(maximum) || maximum <= 0)) missing.push('numeric PRN 24-hour maximum');
  if (isPrn && Number.isFinite(units) && Number.isFinite(maximum) && units > maximum) missing.push('PRN dose must not exceed the 24-hour maximum');
  const covert = [true, 1, '1', 'true', 'on'].includes(input.covertMedication ?? input.covert_medication);
  if (covert && !present(input.covertAuthorisationId ?? input.covert_authorisation_id)) missing.push('active covert-medication authorisation');
  if (input.reviewDate && input.startDate && new Date(input.reviewDate) < new Date(input.startDate)) missing.push('review date must be on or after the start date');
  return { valid: missing.length === 0, missing, schedule, isPrn, covert, doseUnitsPerAdministration: units, maxDoseUnits24h: maximum };
}

export function rollingPrnDose(administrations = [], at = new Date()) {
  const end = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const start = end - 24 * 60 * 60 * 1000;
  return administrations.reduce((total, row) => {
    const time = new Date(row.administered_at || row.administeredAt || '').getTime();
    if (!Number.isFinite(time) || time <= start || time > end || Number(row.is_void) === 1 || clean(row.outcome).toLowerCase() !== 'administered') return total;
    const rawUnits = row.dose_units ?? row.doseUnits ?? (row.stock_change !== undefined && row.stock_change !== null ? Math.abs(Number(row.stock_change)) : 0);
    const units = Number(rawUnits);
    return total + (Number.isFinite(units) ? units : 0);
  }, 0);
}

export function assessPrnAdministration(medication = {}, administrations = [], proposedUnits, at = new Date()) {
  const maximum = Number(medication.max_dose_units_24h ?? medication.maxDoseUnits24h);
  const units = Number(proposedUnits ?? medication.dose_units_per_administration ?? medication.doseUnitsPerAdministration);
  const previous = rollingPrnDose(administrations, at);
  const total = previous + units;
  return { allowed: Number.isFinite(maximum) && maximum > 0 && Number.isFinite(units) && units > 0 && total <= maximum, previous, proposed: units, total, maximum };
}

export function medicationDueSlots(medication = {}, date, now = new Date(), graceMinutes = 30) {
  const day = clean(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number(medication.is_prn) === 1 || clean(medication.status).toLowerCase() !== 'active') return [];
  const times = parseStringList(medication.scheduledTimes ?? medication.scheduled_times_json).filter(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
  const administrations = Array.isArray(medication.administrations) ? medication.administrations : [];
  return times.map(time => {
    const scheduledText = `${day}T${time}:00`, scheduledAt = new Date(scheduledText);
    const entry = administrations.find(row => clean(row.scheduled_at || row.scheduledAt).slice(0, 16) === scheduledText.slice(0, 16) && Number(row.is_void) !== 1);
    const overdue = !entry && now.getTime() > scheduledAt.getTime() + Math.max(0, Number(graceMinutes) || 30) * 60_000;
    return { time, scheduledAt: scheduledText, entry: entry || null, overdue };
  });
}

export function validateGovernanceRecord(input = {}) {
  const allowed = new Set(['capacity_assessment','best_interest_decision','lpa','deputyship','dnacpr','advance_decision','restrictive_practice','restriction_authorisation','covert_medication','end_of_life_preference']);
  const errors = [];
  if (!allowed.has(clean(input.recordType ?? input.record_type, 80))) errors.push('Choose a supported governance record type.');
  if (!present(input.title)) errors.push('Enter a clear record title.');
  if (!present(input.decisionScope ?? input.decision_scope)) errors.push('Record the specific decision or scope.');
  if (!present(input.outcome)) errors.push('Record the outcome.');
  if (clean(input.rationale).length < 20) errors.push('Record a sufficiently clear rationale.');
  if (!validDate(input.reviewDate ?? input.review_date)) errors.push('Set a valid review date.');
  return { valid: errors.length === 0, errors };
}

export function validateCommunicationProfile(input = {}) {
  const errors = [];
  if (!present(input.preferredLanguage ?? input.preferred_language)) errors.push('Record the preferred language.');
  if (!present(input.communicationMethod ?? input.communication_method)) errors.push('Record how the person communicates.');
  if (clean(input.adjustments).length < 5) errors.push('Record the communication adjustments that staff must make.');
  if (!validDate(input.reviewDate ?? input.review_date)) errors.push('Set a valid communication review date.');
  return { valid: errors.length === 0, errors };
}

export function validateFeedbackCase(input = {}) {
  const allowed = new Set(['complaint','compliment','concern','suggestion','whistleblowing']);
  const errors = [];
  if (!allowed.has(clean(input.caseType ?? input.case_type, 40))) errors.push('Choose a valid feedback type.');
  if (!present(input.reporterName ?? input.reporter_name)) errors.push('Record who provided the feedback.');
  if (clean(input.summary).length < 10) errors.push('Record a clear feedback summary.');
  if (!validDate(input.responseDueAt ?? input.response_due_at)) errors.push('Set a response due date.');
  return { valid: errors.length === 0, errors };
}

export function validateQualityAction(input = {}) {
  const errors = [];
  if (!present(input.title)) errors.push('Enter an action title.');
  if (clean(input.actionRequired ?? input.action_required).length < 10) errors.push('Describe the action required.');
  if (!validDate(input.dueAt ?? input.due_at)) errors.push('Set an action due date.');
  if (!present(input.ownerUserId ?? input.owner_user_id)) errors.push('Assign an action owner.');
  return { valid: errors.length === 0, errors };
}

export function validateClinicalObservation(input = {}) {
  const type = clean(input.observationType ?? input.observation_type, 80);
  const allowed = new Set(['blood_pressure','pulse','temperature','oxygen_saturation','respiratory_rate','blood_glucose','weight','pain','fluid_intake','nutrition','bowel','continence','behaviour_abc','repositioning','wound','skin','other']);
  const errors = [];
  if (!allowed.has(type)) errors.push('Choose a supported observation type.');
  if (!validDate(input.observedAt ?? input.observed_at)) errors.push('Record when the observation was made.');
  const numeric = asNumber(input.valueNumeric ?? input.value_numeric);
  if (numeric === null && !present(input.valueText ?? input.value_text)) errors.push('Record the observation result.');
  return { valid: errors.length === 0, errors, type, numeric };
}

export function calculateQualityDashboard(input = {}, now = new Date()) {
  const feedback = Array.isArray(input.feedback) ? input.feedback : [];
  const audits = Array.isArray(input.audits) ? input.audits : [];
  const actions = Array.isArray(input.actions) ? input.actions : [];
  const governance = Array.isArray(input.governance) ? input.governance : [];
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const clock = now.getTime();
  const active = status => !['closed','cancelled','withdrawn','revoked','superseded'].includes(clean(status, 40).toLowerCase());
  const overdueFeedback = feedback.filter(row => active(row.status) && validDate(row.response_due_at) && new Date(row.response_due_at).getTime() < clock);
  const overdueActions = actions.filter(row => active(row.status) && validDate(row.due_at) && new Date(row.due_at).getTime() < clock);
  const governanceDue = governance.filter(row => clean(row.status).toLowerCase() === 'active' && validDate(row.review_date) && new Date(row.review_date).getTime() <= clock + 30 * 86_400_000);
  const escalations = observations.filter(row => Number(row.escalation_required) === 1 && !present(row.verified_at));
  return {
    metrics: {
      openFeedback: feedback.filter(row => active(row.status)).length,
      overdueFeedback: overdueFeedback.length,
      openAudits: audits.filter(row => active(row.status)).length,
      overdueActions: overdueActions.length,
      governanceDue: governanceDue.length,
      observationEscalations: escalations.length,
    },
    priorities: [
      ...overdueFeedback.map(row => ({ type: 'feedback', id: row.id, severity: row.risk_level === 'critical' ? 'critical' : 'warning', title: `Feedback response overdue: ${row.case_reference}` })),
      ...overdueActions.map(row => ({ type: 'quality_action', id: row.id, severity: row.priority === 'critical' ? 'critical' : 'warning', title: `Quality action overdue: ${row.title}` })),
      ...governanceDue.map(row => ({ type: 'governance', id: row.id, severity: new Date(row.review_date).getTime() < clock ? 'critical' : 'warning', title: `Governance review due: ${row.title}` })),
      ...escalations.map(row => ({ type: 'observation', id: row.id, severity: 'critical', title: `Clinical escalation awaiting verification: ${clean(row.observation_type).replaceAll('_', ' ')}` })),
    ].slice(0, 100),
  };
}
