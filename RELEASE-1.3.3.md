# CoreCare Enterprise 1.3.3 — Workspace UX Polish

## Improvements

- Removed the unintended blank column between the platform sidebar and page content.
- Unified the platform shell into a single responsive grid.
- Expanded platform pages to use the available browser width.
- Improved dashboard density at large desktop resolutions.
- Added refined panel, navigation and hover treatments.
- Improved tablet and mobile layout behaviour.
- Preserved the existing Workflow Engine and Notification Centre functionality.

## Technical note

The gap was caused by the shell already allocating a sidebar grid column while the platform workspace also applied a second left margin. Version 1.3.3 removes that duplicated offset.
