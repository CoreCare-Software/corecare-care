# CoreCare Enterprise 1.20.3

## Rota publication and 24-hour service-day fix

- One-off visits now publish using an explicit browser-local-to-UTC conversion.
- After publication, CoreCare automatically opens the correct service day, clears filters and focuses the new visit.
- The rota API now loads a safe boundary around the requested week so overnight visits are not omitted.
- Every rota day now runs from 06:00 through to 06:00 the following morning.
- Visits between midnight and 05:59 belong to the previous rota service day.
- Board, week and list views all use the same 06:00 service-day grouping.

## Database

No migration required.
