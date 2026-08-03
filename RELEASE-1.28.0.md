# CoreCare Care 1.28.0 — Platform command-centre access

Adds the standard CoreCare Platform `/platform-access` receiver.

- Exchanges five-minute single-use Platform launch codes server-to-server.
- Requires the configured Platform origin and Care product key.
- Verifies the central platform user and target Care organisation.
- Creates a short-lived CoreCare Care support-mode session on the Care domain.
- Carries the access mode, reason and central support-session ID into Care audit records.

Configure `PLATFORM_ORIGIN` and the `CORECARE_PRODUCT_KEY` secret before deployment. No Care database migration is required.
