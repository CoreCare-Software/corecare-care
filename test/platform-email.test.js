import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlatformEmailPayload, requestPlatformSupportTicket, requestPlatformTransactionalEmail } from '../src/platform-email.js';

test('Care builds the allow-listed Platform email request', () => {
  assert.deepEqual(buildPlatformEmailPayload({
    organisationId: ' care-org ',
    templateKey: 'account_invitation',
    sourceEventId: 'care-user:user-1:created',
    recipientEmail: ' Person@Example.test ',
    recipientName: 'Person Name',
    accessLabel: 'Carer',
    temporaryPassword: 'Temporary123!',
  }), {
    product_code: 'CARE',
    organisation_id: 'care-org',
    template_key: 'account_invitation',
    source_event_id: 'care-user:user-1:created',
    recipient_email: 'person@example.test',
    recipient_name: 'Person Name',
    access_label: 'Carer',
    temporary_password: 'Temporary123!',
  });
});

test('Care reports unavailable delivery when the central binding or credential is missing', async () => {
  assert.deepEqual(await requestPlatformTransactionalEmail({}, {}), {
    ok: false,
    status: 'not_configured',
    error: 'CoreCare Platform email delivery is not configured.',
  });
});

test('Care submits account email through the signed Platform service binding', async () => {
  let received;
  const response = await requestPlatformTransactionalEmail({
    CORECARE_PRODUCT_KEY: 'care-secret',
    CORECARE_PLATFORM: {
      async fetch(request) {
        received = request;
        return Response.json({ ok: true, status: 'sent', delivery: { id: 'delivery-1', status: 'sent' } }, { status: 201 });
      },
    },
  }, {
    organisationId: 'care-org',
    templateKey: 'password_changed',
    sourceEventId: 'care-user:user-1:password-changed:event-1',
    recipientEmail: 'person@example.test',
    recipientName: 'Person Name',
    accessLabel: 'Carer',
    actionTime: '2026-08-05T10:00:00.000Z',
  });

  assert.equal(response.status, 'sent');
  assert.equal(received.url, 'https://corecare-platform.internal/api/platform/transactional-email');
  assert.equal(received.headers.get('x-corecare-product-key'), 'care-secret');
  assert.equal((await received.json()).product_code, 'CARE');
});

test('Care sends password links and privacy-safe incident fields through the allow-listed contract', () => {
  const payload=buildPlatformEmailPayload({organisationId:'care-org',templateKey:'incident_alert',sourceEventId:'care-incident:1:owner',recipientEmail:'owner@example.test',recipientName:'Owner',accessLabel:'Owner',actionUrl:'https://care.example.test/?reset=token',incidentReference:'INC-1',incidentSeverity:'high',incidentOccurredAt:'2026-08-05T10:00:00Z'});
  assert.equal(payload.action_url,'https://care.example.test/?reset=token');
  assert.equal(payload.incident_reference,'INC-1');
  assert.equal(payload.incident_severity,'high');
  assert.equal('description' in payload,false);
});

test('Care relays a created support ticket with requester contact details', async()=>{
  let received;
  const result=await requestPlatformSupportTicket({CORECARE_PRODUCT_KEY:'care-secret',CORECARE_PLATFORM:{async fetch(request){received=await request.json();return Response.json({ticketId:'central-1',ticketNumber:'CC-1'},{status:201})}}},{id:'local-1',organisationId:'care-org',subject:'Unable to sign in',description:'The sign in screen reports an error.',priority:'high',category:'access',contactName:'Care Manager',contactEmail:'manager@example.test'});
  assert.equal(result.status,'delivered');
  assert.equal(received.product_code,'CARE');
  assert.equal(received.contact.email,'manager@example.test');
});

test('Care persists requester contact and retries queued support tickets',()=>{
  const migration=readFileSync(new URL('../migrations/0048_email_automation.sql',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(migration,/ADD COLUMN support_requester_name TEXT/);
  assert.match(migration,/ADD COLUMN support_requester_email TEXT/);
  assert.match(worker,/retryPendingCareSupportTickets\(env\)/);
  assert.match(worker,/COALESCE\(NULLIF\(t\.support_requester_email,''\),u\.email,''\)/);
});
