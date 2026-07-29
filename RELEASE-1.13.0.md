# CoreCare Enterprise 1.13.0 — Intelligent Template & Recurrence Engine

## Added
- Client recurring visit templates with preferred and backup carers.
- Multi-week carer working-pattern templates.
- Holiday, sickness, hospital and replacement-carer exceptions.
- Generate Week workflow with fill-only and safe regeneration modes.
- Continuity-first allocation using preferred then backup carers.
- Automatic allocation queue fallback when no suitable carer is available.
- Generation history and audit records.
- Travel recalculation after template generation.

## Database
Migration `0029_intelligent_templates_recurrence.sql` is required.
