import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultFamilyAccessReviewDate, familyAccessReviewState, normaliseFamilyPortalAccess, normaliseFamilyPreferences, validateFamilyMessage, validateFamilyUpdate } from '../src/family-portal.js';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0051_family_portal_hub.sql', import.meta.url), 'utf8');

test('family access defaults are useful but clinical detail remains opt-in', () => {
  const access = normaliseFamilyPortalAccess({}, new Date('2026-08-06T12:00:00Z'));
  assert.deepEqual(access, {
    canViewProfile: true,
    canViewVisits: true,
    canViewCareUpdates: true,
    canViewDocuments: false,
    canViewMedication: false,
    canViewCarePlan: false,
    canMessageTeam: true,
    relationship: '',
    accessReviewDate: '2027-08-06'
  });
  assert.equal(defaultFamilyAccessReviewDate(new Date('2024-02-29T12:00:00Z')), '2025-03-01');
});

test('access review status highlights missing, due and overdue authority checks', () => {
  const now = new Date('2026-08-06T12:00:00Z');
  assert.equal(familyAccessReviewState('', now), 'missing');
  assert.equal(familyAccessReviewState('2026-08-05', now), 'overdue');
  assert.equal(familyAccessReviewState('2026-08-20', now), 'due_soon');
  assert.equal(familyAccessReviewState('2026-10-01', now), 'current');
});

test('family messages and published updates reject empty or unclear content', () => {
  assert.equal(validateFamilyMessage({ subject: 'Hi', message: '' }).error, 'Enter a message for the care team.');
  assert.equal(validateFamilyMessage({ subject: 'Hi', message: 'Please call me' }).error, 'Enter a clear subject for the conversation.');
  assert.deepEqual(validateFamilyMessage({ subject: 'Visit question', message: 'Please confirm tomorrow', category: 'visits', priority: 'important' }).value, {
    subject: 'Visit question', body: 'Please confirm tomorrow', category: 'visits', priority: 'important'
  });
  assert.ok(validateFamilyUpdate({ title: 'Visit', summary: 'short' }).error);
  assert.equal(validateFamilyUpdate({ title: 'Good visit', summary: 'Mary enjoyed lunch and the garden.' }).value.category, 'care');
});

test('family notification preferences are constrained to supported options', () => {
  assert.deepEqual(normaliseFamilyPreferences({ emailNotifications: false, digestFrequency: 'hourly' }), {
    inAppNotifications: true,
    emailNotifications: false,
    visitNotifications: true,
    careUpdateNotifications: true,
    documentNotifications: true,
    messageNotifications: true,
    digestFrequency: 'immediate'
  });
});

test('worker uses deliberate publication and per-document sharing boundaries', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS family_shared_updates/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS family_document_shares/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS family_message_threads/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS family_notifications/);
  assert.match(worker, /JOIN family_document_shares s ON s\.document_id=d\.id/);
  assert.match(worker, /JOIN family_shared_updates u ON u\.client_id=f\.client_id/);
  assert.match(worker, /cp\.approval_status='approved'/);
  assert.doesNotMatch(worker.match(/async function familyPortal[\s\S]*?\/\/ Sprint 12/)?.[0] || '', /JOIN visit_care_records/);
});

test('manager and family browser experiences expose the complete portal workflow', () => {
  assert.match(browser, /async function loadFamilyManagement/);
  assert.match(browser, /async function loadFamilyPortalPage/);
  assert.match(browser, /Messages with the care team/);
  assert.match(browser, /Family-safe care update/);
  assert.match(browser, /Explicitly shared documents/);
  assert.match(browser, /Notification preferences/);
  assert.match(browser, /Review access/);
});
