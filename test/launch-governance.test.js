import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAUNCH_GOVERNANCE_DOMAINS, deriveLaunchDomainStatus, deriveOverallLaunchStatus, validateLaunchSignoff } from '../src/launch-governance.js';

const migration = readFileSync(new URL('../migrations/0046_launch_governance.sql', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('launch governance covers every organisational launch domain', () => {
  assert.deepEqual(LAUNCH_GOVERNANCE_DOMAINS.map(domain => domain.key), [
    'accountable_provider', 'clinical_safety', 'data_protection', 'backup_restore',
    'business_continuity', 'staff_training', 'incident_response', 'production_acceptance'
  ]);
  assert.ok(LAUNCH_GOVERNANCE_DOMAINS.every(domain => domain.checks.length === 4));
});

test('evidence cannot become ready without completed criteria and accountable details', () => {
  const checks = LAUNCH_GOVERNANCE_DOMAINS[0].checks.map(([key]) => ({ key, completed: true }));
  assert.equal(deriveLaunchDomainStatus({}, checks), 'in_progress');
  const record = { owner_name: 'Alex Manager', owner_role: 'Registered manager', evidence_summary: 'The provider reviewed and retained the full evidence pack.', evidence_reference: 'IG-2026-04' };
  assert.equal(deriveLaunchDomainStatus(record, checks), 'ready_for_signoff');
});

test('final production acceptance is blocked until every prerequisite is approved', () => {
  const domain = LAUNCH_GOVERNANCE_DOMAINS.at(-1);
  const checks = domain.checks.map(([key]) => ({ key, completed: true }));
  const record = { owner_name: 'Release Owner', owner_role: 'Accountable officer', evidence_summary: 'All production acceptance scenarios completed successfully.', evidence_reference: 'UAT-2026-08', status: 'ready_for_signoff' };
  assert.match(validateLaunchSignoff(domain, record, checks, [{ key: 'clinical_safety', status: 'ready_for_signoff' }]), /prerequisite/i);
  assert.equal(validateLaunchSignoff(domain, record, checks, [{ key: 'clinical_safety', status: 'approved' }]), '');
  assert.equal(deriveOverallLaunchStatus([{ status: 'approved' }, { status: 'approved' }]), 'approved');
});

test('launch governance is permission-backed, audited and presented in Settings', () => {
  assert.match(migration, /organisation_launch_governance/);
  assert.match(migration, /governance\.launch\.approve/);
  assert.match(worker, /getLaunchGovernance/);
  assert.match(worker, /launch_governance\.approved/);
  assert.match(app, /data-settings-target="governance"/);
  assert.match(app, /launch-signoff-dialog/);
});
