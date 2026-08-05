# CoreCare Care 1.36.0 — automatic account email

This release connects Care account management to the central CoreCare Platform transactional-email service.

## Delivered

- Automatic branded invitation emails for new organisation users, staff login accounts and family portal accounts.
- Automatic reset emails when a family temporary password is changed.
- Password-change security notices for signed-in Care users.
- Correct Care product, organisation, access level and sign-in link in every message.
- Forced password change for all newly provisioned organisation owners and other temporary-password accounts.
- Truthful sent, unavailable and failed feedback in the Care interface, with a secure manual-handover instruction when delivery is unavailable.
- Care audit events for every requested account email without storing the temporary password.
- Signed service-binding delivery to CoreCare Platform; Care is not able to operate as an arbitrary email relay.

## Release boundary

The source integration is complete, but automatic delivery must remain disabled until the CoreCare sender has been authorised in Cloudflare Email Sending. A manager-created account remains usable if delivery is unavailable, and CoreCare clearly instructs the manager to hand over the temporary password securely.

Care uses the existing `CORECARE_PLATFORM` service binding and `CORECARE_PRODUCT_KEY` secret. Email sender configuration and delivery history are managed centrally in CoreCare Platform.
