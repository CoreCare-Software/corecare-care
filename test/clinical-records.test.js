import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carePlanReadiness, validateAdministration, validateBodyMap, validateMedicationProfile } from '../src/clinical-records.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('care-plan approval readiness requires person-centred and domain safety information', () => {
  const incomplete = carePlanReadiness({ planSummary: 'Support overview', consentStatus: 'Not recorded', capacityStatus: 'Not assessed' }, []);
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.missing.includes('Record what matters to the person.'));

  const complete = carePlanReadiness({ planSummary: 'Support overview', whatMatters: 'Family and familiar routines', consentStatus: 'Person consented', capacityStatus: 'Has capacity' }, [{ enabled: true, assessedNeeds: 'Needs prompting', desiredOutcomes: 'Maintain independence', supportInstructions: 'Offer one prompt and allow time', risksControls: 'Observe for distress and stop if asked' }]);
  assert.equal(complete.ready, true);
  assert.equal(complete.score, 100);
});

test('medication profiles reject unsafe schedules and incomplete PRN protocols', () => {
  assert.match(validateMedicationProfile({ name: 'Paracetamol', dose: '1 tablet', scheduledTimes: ['25:00'] }), /HH:MM/);
  assert.match(validateMedicationProfile({ name: 'Paracetamol', dose: '1 tablet', isPrn: true }), /PRN protocol/);
  assert.equal(validateMedicationProfile({ name: 'Paracetamol', dose: '1 tablet', scheduledTimes: ['08:00', '20:00'] }), '');
});

test('administrations require active medication, exception reasons and sufficient stock', () => {
  const now = Date.now();
  assert.match(validateAdministration({ outcome: 'refused', administeredAt: new Date(now).toISOString() }, { status: 'active', stock_quantity: null }, now), /reason/);
  assert.match(validateAdministration({ outcome: 'administered', stockUsed: 2, administeredAt: new Date(now).toISOString() }, { status: 'active', stock_quantity: 1 }, now), /not enough/);
  assert.match(validateAdministration({ outcome: 'administered', stockUsed: 1, administeredAt: new Date(now).toISOString() }, { status: 'paused', stock_quantity: 2 }, now), /Only active/);
  assert.equal(validateAdministration({ outcome: 'administered', stockUsed: 1, administeredAt: new Date(now).toISOString() }, { status: 'active', stock_quantity: 2 }, now), '');
});

test('body-map input validates coordinates, progress notes and clinical states', () => {
  assert.match(validateBodyMap({ description: 'Bruising', view: 'front', xPercent: 101, yPercent: 50 }), /within/);
  assert.match(validateBodyMap({ note: '', status: 'monitoring' }, { update: true }), /progress note/);
  assert.equal(validateBodyMap({ description: 'Bruising', view: 'back', xPercent: 40, yPercent: 25, severity: 'high' }), '');
});

test('clinical workflows are wired through the live Worker and browser screens', () => {
  assert.match(worker, /"care_plans\.edit", \(\) => createBodyMapRecord/);
  assert.doesNotMatch(worker, /care_plans\.manage/);
  assert.match(worker, /carePlanReadiness\(toCarePlan\(plan\)/);
  assert.match(worker, /publicUser\(user\),permissions:access\.permissions,modules:access\.modules/);
  assert.match(html, /id="daily-mar-list"/);
  assert.match(html, /id="medication-stock-dialog"/);
  assert.match(html, /id="medication-correction-dialog"/);
  assert.match(html, /id="care-plan-history-dialog"/);
  assert.match(app, /function renderDailyMar\(/);
  assert.match(app, /function renderBodyMap\(/);
});
