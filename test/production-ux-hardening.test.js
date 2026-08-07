import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('mobile retains quick add and an actionable attention centre', () => {
  assert.match(html, /id="quick-add"/);
  assert.match(html, /id="open-attention-centre"/);
  assert.match(app, /\$\('#open-attention-centre'\)\.addEventListener\('click', \(\) => navigateTo\('operations'\)\)/);
  assert.doesNotMatch(styles, /@media\(max-width:780px\)[^}]*\.top-actions\{display:none\}/);
  assert.match(styles, /@media\(max-width:780px\)[\s\S]*?\.top-actions\{display:flex/);
});

test('production fallback copy does not advertise implemented modules as future work', () => {
  const obsolete = /will be introduced|later milestone|future build|will be built here|will be managed here/i;
  assert.doesNotMatch(html, obsolete);
  assert.doesNotMatch(app, obsolete);
});
