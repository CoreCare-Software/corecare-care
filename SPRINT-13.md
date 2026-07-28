# Sprint 13 — Isolated Support Mode

This release makes Support Mode a fully isolated organisation workspace.

## Changes

- Platform-wide organisation lists are hidden while Support Mode is active.
- Platform APIs reject cross-organisation access until Support Mode is exited.
- Organisation switching is only available from the Platform workspace.
- The persistent Support Mode banner now shows the organisation, platform user, start time, access mode and support reason.
- The exit action remains available and returns the user to the Platform workspace.
- No database migration is required.
