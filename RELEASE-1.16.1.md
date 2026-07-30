# CoreCare Enterprise 1.16.1 — Allocation Engine Repair

## Fixes

- Allocating an unallocated visit to a care worker now preserves the visit's existing required start time.
- Moving a visit between care workers preserves its time; dragging within the same worker lane remains the explicit way to alter a flexible visit time.
- Time-critical visits can now be allocated or reallocated between carers without changing the protected time.
- Protected time is shown with a time-critical indicator rather than being presented as a planner lock.
- Planner-locked visits remain immovable and use a separate lock indicator.
- Protected visits still require manager authorisation for any actual time change.
- Resize remains disabled for protected-time visits because resizing can affect the protected care window.
