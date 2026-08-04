import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const occurrences = (source, value) => source.split(value).length - 1;

test('settings are presented as a focused sectioned hub', () => {
  assert.match(app, /function setupSettingsHub()/);
  assert.match(app, /data-settings-target="overview"/);
  assert.match(app, /data-settings-target="organisation"/);
  assert.match(app, /data-settings-target="branding"/);
  assert.match(app, /data-settings-target="locations"/);
  assert.match(app, /data-settings-target="access"/);
  assert.match(app, /data-settings-target="security"/);
  assert.match(app, /data-settings-target="modules"/);
  assert.match(app, /data-settings-target="audit"/);
  assert.match(styles, /.settings-shell{/);
  assert.match(styles, /.settings-navigation{/);
});

test('personal password and rota travel settings live in their workflow context', () => {
  assert.equal(occurrences(html, 'id="open-password"'), 1);
  assert.equal(occurrences(html, 'id="routing-settings-form"'), 1);
  assert.ok(html.indexOf('id="routing-settings-form"') > html.indexOf('id="rota-page"'));
  assert.ok(html.indexOf('id="routing-settings-form"') < html.indexOf('id="settings-page"'));
  assert.doesNotMatch(html, /routing-settings-card/);
  assert.equal(html.includes('<h2>Your password</h2>'), false);
  assert.match(html, /id="user-account-menu"/);
});

test('settings loading and saving protect partial work', () => {
  assert.equal(app.includes("Promise.allSettled([api('/api/organisation/profile')"), true);
  assert.equal(app.includes("Promise.allSettled([api('/api/security/overview')"), true);
  assert.match(app, /function hasUnsavedSettings()/);
  assert.match(app, /beforeunload/);
  assert.match(app, /data-dirty-for="organisation-form"/);
  assert.match(app, /Coming soon/);
  assert.match(app, /Refresh login history/);
  assert.match(app, /User for access customisation/);
  assert.match(app, /User for access test/);
});
