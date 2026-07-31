# CoreCare v1.25.5

## Care-plan section collapse

- Keeps the rebuilt stable button-based care-plan toggle.
- Collapses the domain input fields when a section is marked **Not included**.
- Restores the fields when the section is included again.
- Uses a direct display change only on the field container, avoiding the previous modal repaint failure.

Database migration: not required.
