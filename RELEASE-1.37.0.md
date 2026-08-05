# CoreCare Care 1.37.0 — centrally enforced subscription access

This release connects normal Care access to the CoreCare Platform billing entitlement contract.

## Delivered

- Signed-in customer access is full for an active paid subscription or unexpired trial.
- A past-due subscription is read-only and normal customer mutations are blocked.
- Expired, cancelled, missing, invalid or stale entitlement state is locked.
- Trial access expires at the exact Platform timestamp without waiting for a later central sync.
- Authorised and audited Platform support sessions remain separate from customer subscription access.
- Care refreshes central entitlements during Platform health polling and before access when the local contract is old.
- Subscription state is included in the signed-in user response so the interface can explain access restrictions.

## Operational notes

- Apply control migration `0002_subscription_access.sql` before deploying the Worker.
- The Worker must retain its `CORECARE_PLATFORM` service binding and `CORECARE_PRODUCT_KEY` secret.
- Non-locked entitlement contracts older than fifteen minutes fail closed until a successful refresh.
