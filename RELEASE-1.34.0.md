# CoreCare Care 1.34.0 — Launch readiness

This consolidated release strengthens the live care workflows without changing the separate CoreCare Platform custom-domain work.

## Included

- Branch-scoped API access and database guards for client-linked clinical, operational and finance records.
- Branch-aware handovers and rota generation history.
- Configurable session lifetime and enforced idle timeout; unsupported authentication-policy switches are no longer presented as active protection.
- Independent care-plan approval, medication authorisation details, controlled-medicine witness evidence and eMAR-only medication administration.
- Expiring visit verification codes, timestamp and visit-window validation, and scheduled PRN-effectiveness follow-up.
- Linked body-map escalation and stronger high-severity incident closure, safeguarding and duty-of-candour evidence.
- Atomic invoice numbering and broader controlled reporting exports.
- Private R2-backed client document uploads with authenticated staff and family downloads.
- Current Cloudflare compatibility, structured observability and hourly maintenance scheduling.

## Release boundary

Software deployment does not itself authorise live care data. Complete the checks in `LAUNCH-READINESS-1.34.0.md`, including clinical-safety, data-protection, backup/restore, continuity, training and organisational approval.
