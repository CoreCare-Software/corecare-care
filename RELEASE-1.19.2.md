# CoreCare Enterprise v1.19.2

## QR clock-in and care-record hotfix

- Fixed QR clock-in for platform owners, managers and support-mode users without a linked staff profile.
- QR clock-in now selects the nearest allocated visit rather than silently clocking into an unallocated duplicate.
- Visit status refreshes after successful event sync.
- Care records can then be saved against the correct in-progress visit.
- No database migration required.
