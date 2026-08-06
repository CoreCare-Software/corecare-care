# CoreCare Care 2.0.1 — Holiday-safe Rotas

Release 2.0.1 introduces a complete annual-leave workflow within the Care-only staff record.

## Staff holidays

- Managers and authorised HR users can add or edit approved annual leave from **Staff → Holidays & attendance**.
- Holiday dates are held as restricted workforce records with approval and audit evidence.
- Staff records clearly show when rota protection is active.

## Rota protection

- Planned or active leave blocks allocation through the rota planner, multi-carer team editor, template generator and operational visits screen.
- Database triggers provide a final safeguard against allocation paths that bypass application checks.
- Saving leave automatically removes the care worker from overlapping future scheduled visits.
- Affected published visits return to draft and become unallocated or partially allocated, depending on the remaining care team.
- Each affected visit receives a persistent manager exception requiring cover and republication.

## Deployment

Apply `migrations/0056_staff_holiday_rota_protection.sql` before deploying the Worker so the updated allocation checks and annual-leave fields are available together.
