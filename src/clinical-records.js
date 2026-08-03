const value = input => String(input ?? '').trim();

export function carePlanReadiness(plan = {}, sections = []) {
  const included = (Array.isArray(sections) ? sections : []).filter(section => section?.enabled !== false && section?.enabled !== 0);
  const missing = [];
  const requireItem = (complete, label) => {
    if (!complete) missing.push(label);
    return complete ? 1 : 0;
  };

  let completed = 0;
  completed += requireItem(Boolean(value(plan.planSummary ?? plan.plan_summary)), 'Add a concise plan summary.');
  completed += requireItem(Boolean(value(plan.whatMatters ?? plan.what_matters)), 'Record what matters to the person.');
  completed += requireItem(!['', 'Not recorded'].includes(value(plan.consentStatus ?? plan.consent_status)), 'Record the person’s consent status.');
  completed += requireItem(!['', 'Not assessed'].includes(value(plan.capacityStatus ?? plan.capacity_status)), 'Record the person’s mental-capacity status.');
  completed += requireItem(included.length > 0, 'Include at least one care and support domain.');
  completed += requireItem(included.length > 0 && included.every(section => value(section.assessedNeeds ?? section.assessed_needs)), 'Complete assessed needs for every included domain.');
  completed += requireItem(included.length > 0 && included.every(section => value(section.desiredOutcomes ?? section.desired_outcomes)), 'Complete desired outcomes for every included domain.');
  completed += requireItem(included.length > 0 && included.every(section => value(section.supportInstructions ?? section.support_instructions)), 'Add clear staff instructions for every included domain.');
  completed += requireItem(included.length > 0 && included.every(section => value(section.risksControls ?? section.risks_controls)), 'Record risks and controls for every included domain.');

  const total = 9;
  return {
    ready: missing.length === 0,
    score: Math.round(completed / total * 100),
    completed,
    total,
    domainsIncluded: included.length,
    missing
  };
}

export function validateMedicationProfile(input = {}) {
  const name = value(input.name);
  const dose = value(input.dose);
  const status = value(input.status) || 'active';
  const times = (Array.isArray(input.scheduledTimes) ? input.scheduledTimes : value(input.scheduledTimes).split(','))
    .map(value)
    .filter(Boolean);
  if (!name || !dose) return 'Medication name and dose are required.';
  if (!['active', 'paused', 'discontinued'].includes(status)) return 'Choose a valid medication status.';
  if (times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return 'Scheduled times must use the 24-hour HH:MM format.';
  if (new Set(times).size !== times.length) return 'Remove duplicate scheduled times.';
  if (value(input.startDate) && value(input.endDate) && value(input.startDate) > value(input.endDate)) return 'The medication end date cannot be before its start date.';
  if (input.isPrn && !value(input.prnProtocol)) return 'Add a PRN protocol before saving a when-required medication.';
  if (status === 'discontinued' && !value(input.discontinuedReason)) return 'Record why this medication was discontinued.';
  const stock = input.stockQuantity === '' || input.stockQuantity == null ? null : Number(input.stockQuantity);
  const threshold = input.lowStockThreshold === '' || input.lowStockThreshold == null ? 5 : Number(input.lowStockThreshold);
  if (stock !== null && (!Number.isFinite(stock) || stock < 0)) return 'Stock quantity must be zero or more.';
  if (!Number.isFinite(threshold) || threshold < 0) return 'Low-stock threshold must be zero or more.';
  return '';
}

export function validateAdministration(input = {}, medication = {}, now = Date.now()) {
  const outcome = value(input.outcome);
  const allowed = ['administered', 'prompted', 'refused', 'omitted', 'unavailable', 'hospitalised', 'asleep', 'missed'];
  if (!allowed.includes(outcome)) return 'Choose a valid administration outcome.';
  if (value(medication.status) !== 'active') return 'Only active medication can receive a new eMAR entry.';
  const administeredAt = new Date(value(input.administeredAt) || now);
  if (Number.isNaN(administeredAt.getTime())) return 'Enter a valid administration time.';
  if (administeredAt.getTime() > now + 15 * 60 * 1000) return 'Administration time cannot be more than 15 minutes in the future.';
  if (administeredAt.getTime() < now - 7 * 24 * 60 * 60 * 1000) return 'Administration entries must be recorded within seven days. Use the correction workflow for older records.';
  const reason = value(input.reason || input.prnReason);
  if (['refused', 'omitted', 'unavailable', 'hospitalised', 'asleep', 'missed'].includes(outcome) && !reason) return `Record the reason for the ${outcome} outcome.`;
  if (medication.is_prn && ['administered', 'prompted'].includes(outcome) && !reason) return 'Record why the PRN medication was required.';
  const stockUsed = Number(input.stockUsed || 0);
  if (!Number.isFinite(stockUsed) || stockUsed < 0) return 'Stock used must be zero or more.';
  if (medication.stock_quantity !== null && medication.stock_quantity !== undefined && ['administered', 'prompted'].includes(outcome)) {
    if (stockUsed <= 0) return 'Enter the stock quantity used for this dose.';
    if (stockUsed > Number(medication.stock_quantity)) return 'There is not enough recorded stock for this administration.';
  }
  return '';
}

export function validateBodyMap(input = {}, { update = false } = {}) {
  if (update && !value(input.note)) return 'Enter a progress note.';
  if (!update && !value(input.description)) return 'Enter a description of the concern.';
  const view = value(input.view) || 'front';
  const severity = value(input.severity) || 'medium';
  const status = value(input.status) || 'open';
  if (!['front', 'back'].includes(view)) return 'Choose the front or back body view.';
  if (!['low', 'medium', 'high', 'critical'].includes(severity)) return 'Choose a valid concern severity.';
  if (!['open', 'monitoring', 'resolved'].includes(status)) return 'Choose a valid concern status.';
  if (!update) {
    const x = Number(input.xPercent), y = Number(input.yPercent);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return 'Place the marker within the body map.';
    const observed = new Date(value(input.firstObservedAt) || Date.now());
    if (Number.isNaN(observed.getTime()) || observed.getTime() > Date.now() + 15 * 60 * 1000) return 'Enter a valid observation time that is not in the future.';
  }
  return '';
}
