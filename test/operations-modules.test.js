import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('Tasks and Incidents open dedicated workspaces', () => {
  assert.match(html, /id="tasks-page"/);
  assert.match(html, /id="incidents-page"/);
  assert.match(html, /id="operations-incident-review-dialog"/);
  assert.match(app, /activatePage\('#tasks-page'\)/);
  assert.match(app, /activatePage\('#incidents-page'\)/);
  assert.match(app, /function renderTasksWorkspace\(/);
  assert.match(app, /function renderIncidentsWorkspace\(/);
});

test('Operations mutations enforce module management permissions', () => {
  assert.match(worker, /"tasks\.manage", \(\) => createOperationsTask/);
  assert.match(worker, /"tasks\.manage", \(\) => updateOperationsTask/);
  assert.match(worker, /"incidents\.manage", \(\) => createOperationsIncident/);
  assert.match(worker, /"incidents\.manage", \(\) => reviewOperationsIncident/);
  assert.match(worker, /"operations\.manage", \(\) => createShiftHandover/);
  assert.match(worker, /"operations\.manage", \(\) => acknowledgeShiftHandover/);
});

test('Operations board supports module viewers without the legacy management-only gate', () => {
  assert.match(worker, /if\(!canViewOperations&&!canViewTasks&&!canViewIncidents\)return forbidden\(\)/);
  assert.doesNotMatch(worker, /\/api\/operations\/board"[^\n]+requireManagementWorkspace/);
});
