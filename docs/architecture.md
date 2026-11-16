# Architecture

## Request and data path

React/Vite → same-origin Nginx `/api/` proxy → FastAPI → PostgreSQL. Render uses
one Docker image with the compiled frontend served by FastAPI, avoiding cross-
origin secrets and CORS configuration. Hash navigation needs no server routes.
The HTTP/mock boundary remains in `src/api/`; HTTP is the default.

SQLAlchemy sessions wrap persistence; Alembic owns versioned schema setup. CSV
imports validate before writing and take a transaction-scoped advisory lock to
serialize duplicate/conflict checks. Synthetic seed data has a persisted marker,
so intentionally deleting all applications does not reseed on restart.

Local development and tests use separate databases/Compose projects. The free
Render blueprint uses distinct dev and production PostgreSQL schemas inside one
free instance. Search-path schema names are strictly validated; migrations create
the target schema. Integration tests verify environment data isolation.

## Observability

The request middleware creates a trace, records only a route template/method/
status, emits a JSON log with trace_id, and updates request/latency metrics with
exemplars. Dashboard and list reads have database-operation child spans without
SQL text or parameters. The OpenTelemetry Collector receives OTLP HTTP traces and
logs and sends them to Tempo/Loki. Prometheus scrapes API and checker metrics.
Grafana is provisioned with all data sources, trace/log links and a user-impact
summary dashboard. Local service ports are loopback-only.

## Independent checker and responder

`app.runtime` runs outside the API process, polls the dashboard with a five-second
timeout and persists streaks/incidents in PostgreSQL. A valid response is checked,
not merely a 200 status. Two failures create a deduplicated incident. An atomic
claim authorizes at most one remediation attempt. Diagnostic and repair tools
have fixed same-origin paths; the policy only permits disabling an authenticated
dev fault flag. Two successful checks verify recovery; unknown/failed repairs
escalate. Reports are real records returned by `/api/incidents` to authenticated users or the monitoring principal.

This responder is an autonomous deterministic policy agent, not an LLM. Its
control loop and allowlist are explicit and testable; no paid model is required.
Alertmanager webhooks recheck live impact and cannot choose tools or commands.

## Delivery

The full-stack CI command runs in isolated containers. Render dev uses its connected-GitHub CI-check gate for main pushes; production
auto-deploy is off and releases are manually requested from a tested commit.
An optional API-driven GitHub dispatch path is included for explicit releases. Rollback reuses a retained local image or a
Render deployment artifact. Account migration 0002 preserves records but establishes a minimum secure image
version; pre-account images are not compatible rollback targets.
Account setup and actual cloud verification are recorded separately from code.

## Accounts and ownership

Migration 0002 adds users, hashed opaque sessions and nullable application ownership.
Usernames have a separate case-insensitive unique key. Password hashing uses stdlib
scrypt (N=32768, r=8, p=3) with random salts and bounded concurrent hashing. Sessions
are seven-day random tokens; only SHA-256 token digests are persisted. HttpOnly,
SameSite cookies are Secure on hosted HTTPS. Registration/login rotate the browser
session; logout deletes its server record. Authentication uses database-backed
rate counters. No credentials enter telemetry or browser localStorage.

Normal application queries and import uniqueness are scoped to the authenticated
user. Old shared records remain unowned and hidden from normal accounts. The
checker supplies its existing management credential on the dashboard request,
which grants only a synthetic/unowned read scope. It cannot mutate customer records.

The frontend gates its workspace on `/api/auth/me` and creates a separate query
cache for each account identity, clearing it on unmount/logout. A private API 401
returns the UI to sign-in. Same-origin mutations carry a custom verification header;
server checks Origin/Sec-Fetch-Site when present. Use the same-origin proxy, not
a cross-origin API deployment. Render supplies the public origin automatically.

Pre-account images are no longer valid rollback targets once accounts exist;
restoring them could bypass ownership. The local rollback script checks an image
security label. Hosted rollbacks must select an account-compatible release.
