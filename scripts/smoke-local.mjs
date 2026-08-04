import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const ownerCookie = 'corecare_session=corecare-launch-smoke-token';

async function request(path, { method = 'GET', body, cookie = ownerCookie, expected = 200 } = {}) {
  const headers = { accept: 'application/json', origin: base };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(base + path, { method, headers, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, received ${response.status} ${JSON.stringify(payload)}`);
  return { payload, headers: response.headers };
}

const health = (await request('/api/health')).payload;
assert.equal(health.ok, true);
assert.equal(health.version, '1.34.0');
assert.equal((await request('/api/version')).payload.version, '1.34.0');
assert.equal((await request('/api/auth/session')).payload.user.organisationId, 'org-demo');

let clients = (await request('/api/clients')).payload.clients || [];
let client = clients.find(row => row.id !== 'client-smoke-other');
if (!client) {
  client = (await request('/api/clients', { method: 'POST', expected: 201, body: {
    firstName: 'Launch', lastName: 'Client', dateOfBirth: '1945-01-01', town: 'Leeds', nextReview: '2027-01-01', status: 'Active', risk: 'Standard'
  } })).payload.client;
}
assert.ok(client.id);

await request('/api/users', { method: 'POST', expected: 201, body: {
  email: 'launch.manager@example.test', displayName: 'Launch Branch Manager', accessLevel: 'branch_manager', branchId: 'branch-demo-main', temporaryPassword: 'LaunchManager123!'
} });
const loginResponse = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', origin: base }, body: JSON.stringify({ email: 'launch.manager@example.test', password: 'LaunchManager123!' }) });
assert.equal(loginResponse.status, 200, `Branch manager login failed: ${await loginResponse.text()}`);
const managerCookie = (loginResponse.headers.get('set-cookie') || '').split(';')[0];
assert.ok(managerCookie.startsWith('corecare_session='));
await request('/api/clients/client-smoke-other', { cookie: managerCookie, expected: 403 });

const medication = (await request('/api/medication', { method: 'POST', expected: 201, body: {
  clientId: client.id, name: 'Launch test medicine', dose: '1 tablet', scheduledTimes: ['08:00'], status: 'active', stockQuantity: 10, stockUnit: 'tablets', lowStockThreshold: 2,
  prescriberName: 'Launch prescriber', pharmacyName: 'Launch pharmacy', authorisationReference: 'LAUNCH-RX-001', controlledDrug: true, requiresWitness: true
} })).payload;
assert.ok(medication.id);
await request(`/api/medication/${encodeURIComponent(medication.id)}/administer`, { method: 'POST', expected: 201, body: {
  outcome: 'administered', administeredAt: new Date().toISOString(), doseGiven: '1 tablet', stockUsed: 1,
  witnessEmail: 'launch.manager@example.test', witnessPassword: 'LaunchManager123!'
} });

await request('/api/family-access/accounts', { method: 'POST', expected: 201, body: {
  displayName: 'Launch Relative', email: 'launch.relative@example.test', temporaryPassword: 'LaunchRelative123!', clientId: client.id,
  consentBasis: 'Identity and authority checked for the launch smoke test.', canViewProfile: true, canViewVisits: true, canViewCareUpdates: true, canViewDocuments: true, canViewMedication: false
} });

const form = new FormData();
form.set('name', 'Launch smoke document');
form.set('documentType', 'Assessment');
form.set('status', 'Current');
form.set('notes', 'Disposable local launch test');
form.set('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), 'launch-smoke.pdf');
const document = (await request(`/api/clients/${encodeURIComponent(client.id)}/documents/upload`, { method: 'POST', expected: 201, body: form })).payload.document;
assert.equal(document.storedFile, true);
const download = await request(`/api/documents/${encodeURIComponent(document.id)}/file`);
assert.ok(download.payload.byteLength > 5);

const bodyMap = (await request('/api/body-map', { method: 'POST', expected: 201, body: {
  clientId: client.id, view: 'front', xPercent: 50, yPercent: 30, concernType: 'Bruising', bodyLocation: 'Upper arm', description: 'Launch smoke concern', severity: 'critical', actionTaken: 'Manager informed', monitoringPlan: 'Review today', createIncident: true
} })).payload;
assert.equal(bodyMap.incidentCreated, true);
await request(`/api/operations/incidents/${encodeURIComponent(bodyMap.incidentId)}/review`, { method: 'POST', expected: 200, body: {
  status: 'closed', review: 'Launch smoke investigation complete', investigationOwner: 'Registered manager', rootCause: 'Test-only scenario', actionsRequired: 'Remove disposable test records', lessonsLearned: 'Launch gates worked', closureRationale: 'All test actions completed safely', externalNotification: 'not_required', dutyOfCandourCompleted: true
} });

await request('/api/dashboard');
await request('/api/finance');
await request('/api/reports?range=30d');
await request(`/api/medication/daily-mar?clientId=${encodeURIComponent(client.id)}&date=${new Date().toISOString().slice(0, 10)}`);

console.log(JSON.stringify({ ok: true, version: health.version, clientId: client.id, medicationId: medication.id, documentId: document.id, incidentId: bodyMap.incidentId }));
