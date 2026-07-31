# CoreCare v1.24.6 — Care-plan domain toggle stability

- Replaced the domain field `hidden` toggle with an explicit collapsed class.
- Added defensive modal recovery so a domain switch cannot hide the care-plan form or dialog content.
- Clamps the care-plan content scroll position after a large domain section collapses.
- No database migration is required.
