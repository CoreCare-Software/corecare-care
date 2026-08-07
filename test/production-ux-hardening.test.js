import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('mobile retains quick add and an actionable attention centre', () => {
  assert.match(html, /id="quick-add"/);
  assert.match(html, /id="open-attention-centre"/);
  assert.match(html, /id="close-navigation"[^>]+aria-label="Close navigation"/);
  assert.match(app, /function openAttentionCentre\(\)/);
  assert.match(app, /if\(canOpenPage\('operations'\)\) return showPage\('operations'\)/);
  assert.match(app, /if\(canOpenPage\('tasks'\)\) return showPage\('tasks'\)/);
  assert.match(app, /\$\('#open-attention-centre'\)\.addEventListener\('click', openAttentionCentre\)/);
  assert.doesNotMatch(styles, /@media\(max-width:780px\)[^}]*\.top-actions\{display:none\}/);
  assert.match(styles, /@media\(max-width:780px\)[\s\S]*?\.top-actions\{display:flex/);
  assert.match(styles, /@media\(max-width:780px\)\{\.mobile-navigation-close\{display:grid/);
  assert.match(styles, /\.user-menu-trigger\[aria-expanded="true"\]\+\.user-account-menu\{display:block!important\}/);
  assert.match(app, /setMobileNavigationOpen\(false\)/);
});

test('production fallback copy does not advertise implemented modules as future work', () => {
  const obsolete = /will be introduced|later milestone|future build|will be built here|will be managed here/i;
  assert.doesNotMatch(html, obsolete);
  assert.doesNotMatch(app, obsolete);
});

test('recurring visit creation supplies every care-visit column', () => {
  const statement = worker.match(/protected_time_reason,protected_window_minutes\) VALUES\((\?, \?, \(SELECT branch_id FROM clients WHERE id=\? AND organisation_id=\?\), [^`]+)\)`/);
  assert.ok(statement, 'recurring care-visit insert is present');
  assert.equal(statement[1].match(/\?/g)?.length, 20);
});

test('care coordinators can reach their permission-backed care and family workflows', () => {
  assert.match(app, /pages: \['dashboard','clients','staff','family','care','visits','rota','tasks','incidents','reports','support'\]/);
  assert.match(worker, /office_staff: \[[^\]]*'family_portal\.manage'[^\]]*'care_plans\.view'[^\]]*'reports\.view'/);
});

test('sign out clears rendered records before another user can authenticate', () => {
  assert.match(app, /await api\('\/api\/auth\/logout', \{ method: 'POST' \}\);\s*window\.location\.replace\(location\.pathname\)/);
  assert.doesNotMatch(app, /try \{ await api\('\/api\/auth\/logout'[\s\S]*?\} catch \{\}\s*showLogin\(\)/);
});
