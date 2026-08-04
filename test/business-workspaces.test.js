import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { amountToPence, calculateFinanceMetrics, calculateReportSummary, incidentReference, normaliseFinanceTransaction, normaliseIncidentReport, normaliseIncidentReview, normaliseInvoice, validateFinanceSettings } from '../src/business-workspaces.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('incident reports and investigation updates retain governance detail', () => {
  const report = normaliseIncidentReport({ title: 'Fall', description: 'Client found on floor', severity: 'critical', safeguardingRequired: 'on', immediateAction: 'Called clinical lead' });
  assert.equal(report.severity, 'critical');
  assert.equal(report.safeguardingRequired, true);
  assert.equal(report.immediateAction, 'Called clinical lead');
  assert.match(incidentReference('abc-def', new Date('2026-08-04T12:00:00Z')), /^INC-2026-/);

  assert.equal(normaliseIncidentReview({ status: 'closed', review: 'Reviewed' }).error, 'Before closing, record the action taken or lessons learned.');
  const update = normaliseIncidentReview({ status: 'monitoring', review: 'Action allocated', investigationOwner: 'Registered manager', investigationDueAt: '2026-08-10' });
  assert.equal(update.status, 'monitoring');
  assert.equal(update.investigationDueAt, '2026-08-10');
});

test('basic finance validates money, invoices and secure external links', () => {
  assert.equal(amountToPence('12.34'), 1234);
  assert.equal(amountToPence('12.345'), null);
  assert.equal(normaliseFinanceTransaction({ type: 'expense', description: 'Mileage', amount: '18.50', tax: '0' }).amountPence, 1850);
  const invoice = normaliseInvoice({ clientId: 'client-one', description: 'Care services', quantity: '2', unitPrice: '25.00', taxRate: '0', issueDate: '2026-08-04', dueDate: '2026-08-18' });
  assert.equal(invoice.totalPence, 5000);
  assert.ok(validateFinanceSettings({ provider: 'xero', providerUrl: 'http://example.com', invoicePrefix: 'CC' }).error);
  assert.equal(validateFinanceSettings({ provider: 'xero', providerUrl: 'https://go.xero.com', invoicePrefix: 'care' }).invoicePrefix, 'CARE');
});

test('finance and management metrics are derived from records', () => {
  const finance = calculateFinanceMetrics([
    { transaction_type: 'income', amount_pence: 10000, transaction_date: '2026-08-03', payment_status: 'cleared' },
    { transaction_type: 'expense', amount_pence: 2500, transaction_date: '2026-08-04', payment_status: 'cleared' }
  ], [{ status: 'sent', due_date: '2026-08-01', total_pence: 4000 }], new Date('2026-08-04T12:00:00Z'));
  assert.equal(finance.monthNetPence, 7500);
  assert.equal(finance.outstandingPence, 4000);
  assert.equal(finance.overdueInvoices, 1);

  const report = calculateReportSummary({
    visits: [{ status: 'completed', scheduled_start: '2026-08-04T09:00:00Z', actual_start: '2026-08-04T09:05:00Z' }, { status: 'missed', scheduled_start: '2026-08-04T10:00:00Z' }],
    incidents: [{ status: 'closed', severity: 'medium' }, { status: 'investigating', severity: 'high' }],
    tasks: [{ status: 'completed' }, { status: 'open' }],
    staff: [{ status: 'Active', dbs_expiry: '2027-01-01', training_expiry: '2027-01-01' }],
    plans: [{ status: 'Active', review_date: '2027-01-01' }]
  }, new Date('2026-08-04T12:00:00Z'));
  assert.equal(report.visits.completionRate, 50);
  assert.equal(report.incidents.open, 1);
  assert.equal(report.quality.staffComplianceRate, 100);
  assert.equal(calculateReportSummary({}).visits.completionRate, null);
});

test('incidents, finance and reports are real permission-backed workspaces', () => {
  assert.match(html, /id="finance-page"/);
  assert.match(html, /id="reports-page"/);
  assert.match(html, /name="lessonsLearned"/);
  assert.match(app, /activatePage\('#finance-page'\)/);
  assert.match(app, /activatePage\('#reports-page'\)/);
  assert.match(worker, /"finance\.view", \(\) => financeWorkspace/);
  assert.match(worker, /"finance\.manage", \(\) => createFinanceInvoice/);
  assert.match(worker, /"reports\.view", \(\) => reportsWorkspace/);
  assert.match(worker, /userHasPermission\(db,session,'data\.export'\)/);
  assert.match(worker, /exportRecords:canExport\?\{incidents:incidentRows,visits:visitRows\}:null/);
});
