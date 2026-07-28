# CoreCare Enterprise 1.2.3 — Platform Operations Centre

## Overview

This release adds a dedicated live operational command workspace for platform owners.

## Added

- Platform-wide operational status and live check timestamp
- Active sessions and recently active users
- API error monitoring with recent failure details
- 24-hour audit-event monitoring
- Support Mode activity and currently active support sessions
- Service-level health indicators for Worker, D1, authentication, audit, API monitoring and support governance
- Computed operational alerts with healthy, warning and critical states
- Scheduled-job registry, status, latest result, next run and duration
- 24-hour hourly activity chart for audit events and errors
- Persistent dedicated Platform Operations page

## Database

Apply migration `0017_platform_operations_centre.sql` before deployment.

## Version

CoreCare Enterprise 1.2.3
