# Architecture

## Implemented frontend

`App.tsx` provides hash-based page navigation and the four main views. Native
HTML dialogs handle editing and detail reports. `components/` contains shared UI
and the application form. TanStack Query handles loading/errors and invalidates
application/dashboard queries after successful writes.

`api/index.ts` selects `mock.ts` or `http.ts` using public build-time variables.
The mock adapter owns browser persistence and uses `domain.ts` for metrics,
validation, record transitions, and CSV parsing. The HTTP adapter centralizes
fetch, base URL, a 10-second timeout, non-2xx handling, and JSON payloads. Business
rules will become server-authoritative when FastAPI is implemented.

Mock storage is per browser/origin. There is no authentication, server, database,
real incident lifecycle, or cloud telemetry in this milestone. The incident view
uses sanitized synthetic fixtures behind the same API boundary.

## Target backend

See the specification for FastAPI/PostgreSQL, independent availability checks,
OpenTelemetry collection, deployment environments, and constrained remediation.
The HTTP interface is proposed and versioned in API_CONTRACT.md. Integration
work must include server validation, migrations and a real UI/API/database test.
