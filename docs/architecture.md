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
escalate. Reports are real records returned by `/api/incidents`.

This responder is an autonomous deterministic policy agent, not an LLM. Its
control loop and allowlist are explicit and testable; no paid model is required.
Alertmanager webhooks recheck live impact and cannot choose tools or commands.

## Delivery

The full-stack CI command runs in isolated containers. Render dev uses its connected-GitHub CI-check gate for main pushes; production
auto-deploy is off and releases are manually requested from a tested commit.
An optional API-driven GitHub dispatch path is included for explicit releases. Rollback reuses a retained local image or a
Render deployment artifact. Additive migrations preserve prior-image compatibility.
Account setup and actual cloud verification are recorded separately from code.
