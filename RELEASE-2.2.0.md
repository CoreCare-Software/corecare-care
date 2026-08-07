# CoreCare Care 2.2.0

This release introduces the multi-branch rota command centre and a safer published-rota communication workflow.

- Adds a clear all-branches command view and fast branch-focused planning without losing organisation-wide oversight.
- Keeps visits owned by their service branch and makes branch identity visible throughout board, week, list and visit-editor views.
- Ranks home-branch care workers first to protect local continuity and reduce avoidable travel.
- Permits cross-branch cover only for organisation-wide authorised roles, with a mandatory recorded reason and an audit trail.
- Adds explainable, manager-controlled planning recommendations for availability, continuity, workload, travel and branch fit.
- Shows branch workload, unallocated visits, travel risk, draft status and cross-branch cover at a glance.
- Preserves multi-carer requirements, protected visit times, competence checks, leave protection and travel safeguards during allocation.
- Captures a snapshot whenever a rota is published so later time, branch, visit-type or care-team changes can be identified precisely.
- Notifies affected care workers when visits are first published and requires acknowledgement after a published rota changes or is cancelled.
- Gives managers a live count of outstanding rota-change acknowledgements while keeping each care worker's notification private.
- Adds tenant-safe database triggers, indexes and permission boundaries for branch-aware assignments and notification acknowledgements.
- Retains the private-broker opt-in AI rewrite capability introduced in 2.1.0.
