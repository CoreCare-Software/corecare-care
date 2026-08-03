# CoreCare Care 1.28.2 — Owner support access repair

Repairs live organisation monitoring and owner support access from CoreCare Platform.

- Updates the Care organisation summary to use the current central support-ticket schema.
- Removes the invalid legacy `product_code` query that caused HTTP 500 responses.
- Adds regression coverage for the owner Platform organisation-summary contract.

No database migration is required.
