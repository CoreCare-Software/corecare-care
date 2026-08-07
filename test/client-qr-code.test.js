import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const qrLibrary = readFileSync(new URL('../public/vendor/qrcode.min.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0059_fixed_client_qr_codes.sql', import.meta.url), 'utf8');

test('new and regenerated client QR codes are permanent until deliberate revocation', () => {
  assert.match(worker, /INSERT INTO client_visit_codes\(id,organisation_id,client_id,code,active,created_by\) VALUES\(\?,\?,\?,\?,1,\?\)/);
  assert.doesNotMatch(worker, /client_visit_codes[\s\S]{0,220}\+90 days/);
  assert.match(worker, /expires_at IS NULL OR datetime\(expires_at\)>CURRENT_TIMESTAMP/);
  assert.match(worker, /vc\.expires_at IS NULL OR datetime\(vc\.expires_at\)>CURRENT_TIMESTAMP/);
  assert.match(worker, /permanent:row\.expires_at==null/);
  assert.match(worker, /client\.verification_code_regenerated/);
});

test('the database keeps one active code per client while retaining revoked history', () => {
  assert.match(migration, /SET expires_at=NULL[\s\S]*WHERE active=1/);
  assert.match(migration, /ON client_visit_codes\(organisation_id,client_id\)[\s\S]*WHERE active=1/);
  assert.match(migration, /tenant_guard_client_visit_code_insert/);
  assert.match(migration, /c\.id=NEW\.client_id AND c\.organisation_id=NEW\.organisation_id/);
  assert.doesNotMatch(migration, /DELETE FROM client_visit_codes/);
});

test('the client record renders and prints a durable self-contained QR sheet', () => {
  assert.match(html, /id="client-print-qr"/);
  assert.match(html, /The code remains fixed unless an authorised manager regenerates it/);
  assert.match(app, /Fixed to this client · created/);
  assert.match(app, /no expiry/);
  assert.match(app, /Every previously printed QR code will stop working/);
  assert.match(app, /function printClientQr\(\)/);
  assert.match(qrLibrary, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});
