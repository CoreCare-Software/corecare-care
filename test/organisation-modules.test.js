import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORGANISATION_MODULES,
  moduleForApiPath,
  normaliseOrganisationModuleUpdate,
  organisationModuleCatalogue,
  organisationModuleSetupStatements,
  organisationModuleState,
} from '../src/organisation-modules.js';

test('the organisation catalogue is complete and missing settings default safely to enabled', () => {
  assert.equal(ORGANISATION_MODULES.length, 15);
  assert.deepEqual(ORGANISATION_MODULES.map(module => module.key), [
    'dashboard','operations','clients','staff','family','care','medication','visits','rota','tasks','incidents','quality','finance','reports','settings',
  ]);
  const state = organisationModuleState([{ module_key: 'finance', enabled: 0 }]);
  assert.equal(state.finance, false);
  assert.equal(state.quality, true);
  assert.equal(state.settings, true);
  const catalogue = organisationModuleCatalogue([{ module_key: 'finance', enabled: 0, updated_at: '2026-08-07' }]);
  assert.equal(catalogue.find(module => module.module_key === 'finance').enabled, false);
  assert.equal(catalogue.find(module => module.module_key === 'quality').name, 'Quality');
});

test('core care records cannot be disabled by a module update', () => {
  const update = normaliseOrganisationModuleUpdate({ dashboard: false, clients: false, staff: false, care: false, settings: false, finance: false, unknown: false });
  assert.deepEqual(update, { dashboard: true, clients: true, staff: true, care: true, finance: false, settings: true });
  assert.equal('unknown' in update, false);
});

test('module API boundaries cover optional organisation workspaces', () => {
  assert.equal(moduleForApiPath('/api/operations/tasks/abc/complete'), 'tasks');
  assert.equal(moduleForApiPath('/api/operations/incidents/abc/review'), 'incidents');
  assert.equal(moduleForApiPath('/api/operations/board'), 'operations');
  assert.equal(moduleForApiPath('/api/family-access/accounts'), 'family');
  assert.equal(moduleForApiPath('/api/quality/actions'), 'quality');
  assert.equal(moduleForApiPath('/api/medication/daily-mar'), 'medication');
  assert.equal(moduleForApiPath('/api/rota/templates'), 'rota');
  assert.equal(moduleForApiPath('/api/security/modules'), '');
});

test('new organisations receive one module record for every catalogue entry', () => {
  const statements = organisationModuleSetupStatements({
    prepare(sql) { return { bind: (...values) => ({ sql, values }) }; },
  }, 'org-1', 'owner-1');
  assert.equal(statements.length, ORGANISATION_MODULES.length);
  assert.equal(statements[0].values[0], 'org-1');
  assert.equal(statements.at(-1).values[1], 'settings');
});

test('the browser control applies changes immediately and exposes required areas clearly', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../migrations/0058_organisation_module_controls.sql', import.meta.url), 'utf8');
  assert.match(app, /15-area|complete organisation module controls/);
  assert.match(app, /currentUser\.modules=/);
  assert.match(app, /Always available/);
  assert.match(app, /stopImmediatePropagation/);
  assert.match(migration, /'quality',1/);
  assert.match(migration, /'dashboard','clients','staff','care','settings'/);
});
