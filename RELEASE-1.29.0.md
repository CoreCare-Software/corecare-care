# CoreCare Care 1.29.0 — Tasks and incident management

Turns the existing Tasks and Incidents navigation into working care-management modules backed by the live operations records already stored in D1.

- Adds a dedicated task queue with search, status, priority and assignee filters.
- Adds task workload summaries, live counts, completion and escalation actions.
- Adds a dedicated incident register with severity and status filters.
- Replaces the browser prompt with a structured management-review and closure workflow.
- Enforces `tasks.manage`, `incidents.manage` and `operations.manage` on Worker mutations.
- Redacts operations-board data according to the user's task, incident and operations view permissions.
- Preserves the current Cloudflare Worker URL and custom-domain configuration unchanged.

No database migration is required.
