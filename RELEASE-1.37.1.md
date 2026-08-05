# CoreCare Care 1.37.1 — subscription resource limits

This release enforces centrally assigned subscription resource limits inside CoreCare Care.

## Delivered

- Active non-platform users count towards the subscription user limit.
- Active, non-archived clients count towards the subscription client limit.
- User and client creation and reactivation fail safely when a limit has been reached.
- Unlimited subscriptions retain unrestricted user and client creation.

