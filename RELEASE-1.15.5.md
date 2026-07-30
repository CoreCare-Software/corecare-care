# CoreCare Enterprise 1.15.5

Frontend interaction and cache stabilisation.

- Single deployed frontend remains `public/`.
- Cache-busted JavaScript and CSS URLs.
- No-store headers for development frontend assets.
- Application version endpoint and footer aligned to 1.15.5.
- Rota loading errors are surfaced instead of failing silently.
- Template tabs and template action buttons use delegated event handling.
- Script loads after all dialogs and controls exist in the DOM.
