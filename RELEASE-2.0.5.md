# CoreCare Care 2.0.5

This release strengthens access governance and staff-management boundaries.

- Adds an actionable access-review control, including a safe sole-owner self-review rule.
- Explains when another active owner must review an owner's access.
- Restores clear family-login creation feedback when no active client is available.
- Applies a default-deny API boundary to family accounts, allowing only explicitly shared family-portal information.
- Applies a default-deny API boundary to carers, allowing only their allocated care work and their own workforce records.
- Includes organisation owners, area managers, registered/branch managers and other eligible higher roles in the line-manager selector.
- Supports authorised line managers who have a user account without a duplicate staff profile.
- Validates that a selected manager is active, belongs to the organisation, is above the staff member's role and is within the permitted branch scope.
- Adds database-level tenant guards for line-manager assignments.
