# CoreCare Care 1.38.0

Release 1.38.0 connects account recovery, incident notification and requester-facing support email to the central CoreCare Platform delivery service.

## Included

- Secure, one-use password reset links with hashed token storage, 30-minute expiry, enumeration-safe responses and rate limiting.
- Session revocation and a password-changed email after a successful reset.
- Privacy-safe incident email alerts to active organisation owners, administrators and registered managers. Descriptions and care details stay inside Care.
- Support tickets relayed to Platform with the requester's name and email so Platform sends a creation confirmation.
- Requester contact persisted locally and reused by scheduled retries when Platform is temporarily unavailable.

Apply migration `0048_email_automation.sql` before deploying the Worker.
