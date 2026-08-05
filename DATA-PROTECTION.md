# Data protection implementation

Canonical public policies, the customer DPA, rights-request intake, retention schedule and subprocessors are maintained by the CoreCare website. Rights requests, breach cases and legal holds are coordinated in CoreCare Platform.

Scope is the organisation id. The existing audit_log remains the detailed clinical and administrative record; compliance_audit_events adds complete route-level mutation coverage. Care-record retention must be set by the customer controller after its sector review.

All production responses add HSTS and defensive browser headers. Authentication cookies must remain HttpOnly and Secure. Cloudflare D1 (and R2 where configured) provides provider-managed encryption at rest and encrypted transport; this repository must not claim UK-only storage or customer-managed keys without separate evidence.

Scheduled maintenance removes only clearly transient expired session, login-attempt and form-rate-limit state. Customer operational records are not automatically deleted under a generic period. A documented customer instruction, retention rule and legal-hold check are required, and the action must be recorded centrally.

Never put passwords, tokens, full request bodies, health records or payment-card data in compliance metadata or operational logs. See the canonical runbooks under the CoreCare website repository in docs/compliance.

