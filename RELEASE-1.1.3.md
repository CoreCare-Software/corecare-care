# CoreCare Enterprise 1.1.3 — Organisation 360

## Added
- Complete customer account view from the Platform workspace.
- Overview, people and branches, commercial, security, support and activity tabs.
- Live operational metrics, health signals and licence utilisation.
- Branch and user visibility without entering Support Mode.
- Subscription, renewal and revenue-event visibility.
- Security policy and login-history visibility.
- Support sessions, customer-success notes and organisation audit timeline.
- Database foundation for customer-success ownership and lifecycle management.

## Security
Organisation 360 remains restricted to platform users. Opening it does not switch tenant context. Entering the organisation still requires an audited Support Mode reason and access mode.

## Upgrade
Run migration `0016_organisation_360.sql`, then deploy the Worker and static assets.
