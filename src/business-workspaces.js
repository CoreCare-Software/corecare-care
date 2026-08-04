function text(value, maximum = 5000) {
  return String(value ?? '').trim().slice(0, maximum);
}

function booleanValue(value) {
  return [true, 1, '1', 'true', 'on', 'yes'].includes(value);
}

function dateValue(value, fallback = '') {
  const candidate = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T12:00:00Z`)) ? candidate : fallback;
}

function datetimeValue(value) {
  const candidate = text(value, 40);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : '';
}

export function amountToPence(value) {
  const candidate = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(candidate)) return null;
  const amount = Number(candidate);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) return null;
  return Math.round(amount * 100);
}

export function incidentReference(id, now = new Date()) {
  const year = Number.isNaN(now.getTime()) ? new Date().getUTCFullYear() : now.getUTCFullYear();
  const key = String(id || '').replaceAll('-', '').slice(0, 8).toUpperCase().padEnd(8, '0');
  return `INC-${year}-${key}`;
}

export function normaliseIncidentReport(input = {}) {
  const title = text(input.title, 160);
  const description = text(input.description, 10000);
  if (!title || !description) return { error: 'Enter an incident title and description.' };
  const severity = ['low', 'medium', 'high', 'critical'].includes(text(input.severity)) ? text(input.severity) : 'medium';
  return {
    title,
    description,
    clientId: text(input.clientId, 80),
    category: text(input.category, 80) || 'General',
    severity,
    occurredAt: datetimeValue(input.occurredAt),
    injuryOrHarm: text(input.injuryOrHarm, 4000),
    immediateAction: text(input.immediateAction, 5000),
    witnesses: text(input.witnesses, 1000),
    safeguardingRequired: booleanValue(input.safeguardingRequired),
    externalNotification: ['not_required', 'considering', 'cqc', 'local_authority', 'police', 'riddor', 'other'].includes(text(input.externalNotification)) ? text(input.externalNotification) : 'not_required',
    externalReference: text(input.externalReference, 200)
  };
}

export function normaliseIncidentReview(input = {}) {
  const status = ['open', 'investigating', 'monitoring', 'closed'].includes(text(input.status)) ? text(input.status) : 'investigating';
  const review = text(input.review, 10000);
  if (!review) return { error: 'Record the management review or investigation update.' };
  if (status === 'closed' && !text(input.actionsRequired, 5000) && !text(input.lessonsLearned, 5000)) {
    return { error: 'Before closing, record the action taken or lessons learned.' };
  }
  return {
    status,
    review,
    investigationOwner: text(input.investigationOwner, 160),
    investigationDueAt: dateValue(input.investigationDueAt),
    rootCause: text(input.rootCause, 5000),
    actionsRequired: text(input.actionsRequired, 5000),
    lessonsLearned: text(input.lessonsLearned, 5000),
    externalNotification: ['not_required', 'considering', 'cqc', 'local_authority', 'police', 'riddor', 'other'].includes(text(input.externalNotification)) ? text(input.externalNotification) : 'not_required',
    externalReference: text(input.externalReference, 200)
  };
}

export function normaliseFinanceTransaction(input = {}, today = new Date().toISOString().slice(0, 10)) {
  const type = ['income', 'expense'].includes(text(input.type)) ? text(input.type) : '';
  const description = text(input.description, 500);
  const amountPence = amountToPence(input.amount);
  const taxPence = amountToPence(input.tax || '0');
  if (!type || !description || amountPence === null || amountPence === 0 || taxPence === null) return { error: 'Choose income or expense and enter a description and valid amount.' };
  if (taxPence > amountPence) return { error: 'Tax cannot be greater than the total amount.' };
  return {
    type,
    description,
    amountPence,
    taxPence,
    transactionDate: dateValue(input.transactionDate, today),
    category: text(input.category, 100) || (type === 'income' ? 'Care income' : 'Operating expense'),
    clientId: text(input.clientId, 80),
    paymentStatus: ['pending', 'cleared'].includes(text(input.paymentStatus)) ? text(input.paymentStatus) : 'cleared',
    reference: text(input.reference, 160)
  };
}

export function normaliseInvoice(input = {}, today = new Date().toISOString().slice(0, 10)) {
  const clientId = text(input.clientId, 80);
  const description = text(input.description, 500);
  const quantity = Number(input.quantity || 1);
  const unitPricePence = amountToPence(input.unitPrice);
  const taxRate = Number(input.taxRate || 0);
  if (!clientId || !description || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || unitPricePence === null || unitPricePence === 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { error: 'Choose a client and enter a valid invoice description, quantity, rate and tax percentage.' };
  }
  const issueDate = dateValue(input.issueDate, today);
  const dueDate = dateValue(input.dueDate, issueDate);
  if (dueDate < issueDate) return { error: 'The invoice due date cannot be before its issue date.' };
  const subtotalPence = Math.round(quantity * unitPricePence);
  const taxPence = Math.round(subtotalPence * taxRate / 100);
  return {
    clientId,
    description,
    quantity: Math.round(quantity * 1000) / 1000,
    unitPricePence,
    taxBasisPoints: Math.round(taxRate * 100),
    subtotalPence,
    taxPence,
    totalPence: subtotalPence + taxPence,
    issueDate,
    dueDate,
    notes: text(input.notes, 4000)
  };
}

export function validateFinanceSettings(input = {}) {
  const provider = ['none', 'xero', 'quickbooks', 'sage', 'freeagent', 'other'].includes(text(input.provider)) ? text(input.provider) : 'none';
  const providerUrl = text(input.providerUrl, 1000);
  if (provider !== 'none') {
    try {
      const parsed = new URL(providerUrl);
      if (parsed.protocol !== 'https:') throw new Error('protocol');
    } catch {
      return { error: 'Enter a secure https link to your finance software.' };
    }
  }
  const defaultTaxRate = Number(input.defaultTaxRate || 0);
  if (!Number.isFinite(defaultTaxRate) || defaultTaxRate < 0 || defaultTaxRate > 100) return { error: 'Enter a tax rate between 0 and 100.' };
  const invoicePrefix = text(input.invoicePrefix, 12).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!invoicePrefix) return { error: 'Enter an invoice prefix using letters or numbers.' };
  return {
    provider,
    providerUrl: provider === 'none' ? '' : providerUrl,
    providerLabel: text(input.providerLabel, 80) || ({ xero: 'Xero', quickbooks: 'QuickBooks', sage: 'Sage', freeagent: 'FreeAgent', other: 'Finance software' }[provider] || ''),
    invoicePrefix,
    defaultTaxBasisPoints: Math.round(defaultTaxRate * 100)
  };
}

export function calculateFinanceMetrics(transactions = [], invoices = [], now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const cleared = transactions.filter(row => String(row.payment_status || 'cleared') === 'cleared');
  const monthRows = cleared.filter(row => String(row.transaction_date || '').slice(0, 7) === month);
  const incomePence = monthRows.filter(row => row.transaction_type === 'income').reduce((total, row) => total + Number(row.amount_pence || 0), 0);
  const expensePence = monthRows.filter(row => row.transaction_type === 'expense').reduce((total, row) => total + Number(row.amount_pence || 0), 0);
  const cashPositionPence = cleared.reduce((total, row) => total + (row.transaction_type === 'income' ? 1 : -1) * Number(row.amount_pence || 0), 0);
  const outstanding = invoices.filter(row => ['sent', 'overdue'].includes(row.status) || (row.status === 'sent' && row.due_date < today));
  return {
    monthIncomePence: incomePence,
    monthExpensePence: expensePence,
    monthNetPence: incomePence - expensePence,
    cashPositionPence,
    outstandingPence: outstanding.reduce((total, row) => total + Number(row.total_pence || 0), 0),
    overdueInvoices: outstanding.filter(row => row.due_date < today).length
  };
}

export function calculateReportSummary(input = {}, now = new Date()) {
  const visits = Array.isArray(input.visits) ? input.visits : [];
  const incidents = Array.isArray(input.incidents) ? input.incidents : [];
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const staff = Array.isArray(input.staff) ? input.staff : [];
  const plans = Array.isArray(input.plans) ? input.plans : [];
  const today = now.toISOString().slice(0, 10);
  const completedVisits = visits.filter(row => row.status === 'completed');
  const missedVisits = visits.filter(row => row.status === 'missed');
  const onTimeVisits = completedVisits.filter(row => !row.actual_start || new Date(row.actual_start).getTime() <= new Date(row.scheduled_start).getTime() + 15 * 60000);
  const closedIncidents = incidents.filter(row => row.status === 'closed');
  const completedTasks = tasks.filter(row => row.status === 'completed');
  const compliantStaff = staff.filter(row => row.status === 'Active' && row.dbs_expiry && row.training_expiry && row.dbs_expiry >= today && row.training_expiry >= today);
  const activeStaff = staff.filter(row => row.status === 'Active');
  const currentPlans = plans.filter(row => row.status === 'Active' && row.review_date && row.review_date >= today);
  const activePlans = plans.filter(row => row.status === 'Active');
  const percent = (part, whole) => whole ? Math.round(part / whole * 100) : null;
  return {
    visits: { total: visits.length, completed: completedVisits.length, missed: missedVisits.length, completionRate: percent(completedVisits.length, visits.length), onTimeRate: percent(onTimeVisits.length, completedVisits.length) },
    incidents: { total: incidents.length, open: incidents.length - closedIncidents.length, high: incidents.filter(row => ['high', 'critical'].includes(row.severity)).length, closedRate: percent(closedIncidents.length, incidents.length) },
    tasks: { total: tasks.length, completed: completedTasks.length, completionRate: percent(completedTasks.length, tasks.length) },
    quality: { staffComplianceRate: percent(compliantStaff.length, activeStaff.length), carePlanCurrentRate: percent(currentPlans.length, activePlans.length), activeStaff: activeStaff.length, activePlans: activePlans.length }
  };
}
