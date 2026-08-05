import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatformEmailPayload, requestPlatformTransactionalEmail } from '../src/platform-email.js';

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
