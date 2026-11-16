# ApplyTrack — Project Specification

**Project name:** ApplyTrack
**Repository name:** `applytrack`
**Description:** A personal job application tracker with pipeline analytics and automated incident recovery.

## 1. Problem

An active job seeker manages applications across multiple applicant tracking
systems and scattered emails. Weekly reviews require manually combining records
to understand which applications remain open, which need follow-up, and how
outcomes vary by role category.

This application centralizes those records, calculates useful metrics, and
highlights applications needing attention. Version 1 requires manual status
updates; it does not discover employer decisions or eliminate manual entry.
Decision speed is descriptive and must not be presented as proof of automated
screening.

## 2. Product and users

The primary user is the author reviewing their job search each week. Course
reviewers can run the full application locally and inspect a public demo.

The MVP provides application CRUD, CSV import, pipeline counts, rejection rate
by category, median days to rejection, and a list of stale open applications.
A table and summary cards are sufficient; elaborate charts are out of scope.

The author's real records may be imported locally. The public demo uses only
synthetic sample data. Real records and identifying data must not enter source
control, public issues, deployment artifacts, or telemetry.

## 3. Data model and metric definitions

Each application contains:

- ID, company, role, role category, application channel, and status.
- `applied_at`: application date.
- `status_changed_at`: timestamp of the most recent actual status transition.
- `last_followed_up_at`: optional timestamp explicitly recorded by the user.
- `decision_at`: rejection date, required when status is Rejected.
- `created_at` and `updated_at`: record timestamps.

Statuses are Applied, Interview, Rejected, and Closed. Applied and Interview
are open; Rejected and Closed are terminal. A terminal record may be reopened.
When leaving Rejected, clear `decision_at`; re-entering Rejected requires a new
valid rejection date. Dates must be chronologically consistent with `applied_at`.
Imports preserve supplied historical dates rather than treating import time as
a status update. All calculations use UTC; the UI displays dates consistently.

Metric definitions:

- Pipeline counts: total and count per current status; open = Applied + Interview.
- Rejection rate by category: currently Rejected / all applications in that
  category, including open and Closed records. Display the denominator and label
  this as the share rejected so far, not a final rejection probability.
- Median days to rejection: median elapsed days between `applied_at` and
  `decision_at` for currently Rejected records. No qualifying records returns
  null, displayed as “No rejection data”.
- Stale: an open application whose latest of `applied_at`,
  `status_changed_at`, and `last_followed_up_at` is at least 21 days old.
  Editing descriptive fields does not reset this clock.

CSV includes a stable `source_id`, company, role, category, channel, status,
application date, and optional historical status, follow-up, and rejection dates.
Imported `source_id` is unique. Reimporting an identical file creates no
duplicates; an existing ID with changed data is reported as a conflict and is
not silently overwritten. Manual records receive generated IDs. Import validates
all rows before writing; an invalid file produces row-specific errors and no
partial writes. File size and row count limits are documented and enforced.

## 4. Acceptance criteria

1. A user can create, edit, delete, and change the status of an application
   through the UI. Changes survive page refresh and API restart.
2. Dashboard metrics and the stale list are computed from PostgreSQL using
   the definitions above. Empty states render without errors.
3. A user can record a follow-up, removing an eligible application from the
   stale list without changing its status.
4. CSV import produces the expected records and metrics. Reimport does not
   duplicate records; invalid files and conflicts follow the documented rules.
5. One command, `make test`, runs unit, frontend, and integration tests,
   including a Playwright UI → API → PostgreSQL persistence flow, and passes.
6. `docker compose up --build` starts the frontend, API, database, migrations,
   and required local observability services without manual setup. The README
   documents prerequisites and the initial startup time.
7. Pull requests run all tests. A successful main-branch build deploys an
   immutable image to dev. Production deployment requires manual approval of
   a tested image. A documented rollback command restores a previous image;
   a dev rollback drill demonstrates recovery.
8. Dashboard requests produce metrics, traces, and structured logs. Logs and
   traces share a trace ID; metrics link to traces through exemplars where
   supported. The signals are collected, stored, and viewable in a UI.
9. An external checker detects dashboard availability failures and sends a
   deduplicated alert to the responder. A documented dev-only trigger makes
   this repeatable without affecting production.
10. The responder automatically diagnoses the supported injected fault,
    performs an allowlisted remediation, verifies dashboard recovery, and
    records the outcome. Merely posting a diagnosis does not satisfy this item.
11. English documentation includes setup, architecture, metric definitions,
    testing, deployment, rollback, telemetry, alerting, responder limits, and
    a reproducible demo. README links the public demo or deployment recording,
    public task tracker, and evidence of agent use of that tracker.

## 5. Architecture and deployment

- Frontend: React + Vite, application table/forms and dashboard summary cards.
- Backend: Python FastAPI with application, import, dashboard, and health APIs.
- Database: PostgreSQL in local development, integration tests, and deployment.
  Pure metric unit tests use fixtures without a database.
- Packaging: Docker Compose, including database readiness and automatic migrations.
- CI/CD: GitHub Actions tests and builds once, tags images by commit, deploys
  dev automatically, then permits a manually approved production deployment
  of the same image. Hosting provider is chosen during the deployment spike.
- Rollback: redeploy a known-good immutable image using a documented command.
  MVP migrations are additive and compatible with the previous release;
  destructive migrations are out of scope. Image rollback is not a database
  restore; document backup and restore separately.
- Public demo: synthetic data only, bounded uploads and basic request limits;
  management and fault-control endpoints require separate credentials.

## 6. Observability and user-impact alerts

Instrument the “load dashboard” journey, including its database query, with
OpenTelemetry. Collect request count, duration, and failures; store traces and
structured logs with request trace IDs. Do not use trace IDs as metric labels.
Do not log request bodies, CSV contents, company/role names, credentials, or
personal identifiers. Logs use route templates and sanitized error categories.

Use an OpenTelemetry Collector and a locally runnable Grafana stack with
Prometheus, Tempo, and Loki. Ship provisioned data sources and a small dashboard
so reviewers can inspect metrics, traces, and logs without manual configuration.
Use the same signal structure in the deployed environment, with a documented
backend and retention policy. Observability views are not publicly writable.

Two distinct kinds of notifications exist:

- Product reminder: the stale list helps the user choose follow-ups. Employer
  silence is not a service incident and never triggers infrastructure repair.
- Service incident: an external checker requests the dashboard API every
  30 seconds with a 5-second timeout. Two consecutive timeouts, 5xx responses,
  or invalid dashboard responses trigger one incident per environment. Two
  consecutive valid responses resolve it. These synthetic checks measure
  availability of a critical user journey; request telemetry shows actual
  user traffic impact. There is no CPU/memory paging rule in the MVP.

The checker runs outside the API process and can alert when that process is
unavailable. It must not depend solely on the monitored API's telemetry endpoint.
Alerts contain environment, route, failure category, timestamps, incident ID,
release ID, and a trace ID when available, with no application records.

## 7. Responder and repeatable alert trigger

The responder runs independently of the application and receives authenticated
alerts. A constrained policy-based agent inspects checker results and authenticated dev
diagnostics, including the fault flag and release metadata. Tool authorization is
enforced in code; diagnostic input cannot expand the allowed actions. A
deterministic policy check permits or rejects the action before execution.

Required dev demonstration:

1. An authenticated dev-only command enables a persistent fault flag that makes
   the dashboard endpoint return 503. Its control endpoint remains available.
2. The external checker detects the failure and opens an incident.
3. The responder diagnoses the known injected fault and disables the flag via
   its allowlisted control tool, without human approval for this dev scenario.
4. It verifies two consecutive successful dashboard checks, then records the
   diagnosis, action, and recovery evidence in a sanitized incident report.

The fault flag and its control route are disabled in production. Unauthenticated
requests cannot modify it. The responder cannot edit job applications, execute
arbitrary shell commands, or change database schemas. Duplicate alerts are
idempotent; only one remediation attempt is allowed per incident. Unknown faults,
failed repair, or failed verification produce an unresolved report and human
escalation instead of repeated actions. Production rollback remains a documented
operator action in the MVP.

Incident reports are persisted and visible in a simple incident view; an optional
GitHub issue adapter may publish sanitized reports. An interrupted responder leaves a visible unresolved incident. Tests use constrained tool adapters; the demo includes a real autonomous policy-based responder run. No paid model is required.

## 8. Testing and evidence

- Unit: metric denominators, empty datasets, rejection medians, exact 21-day
  boundary, reopened applications, follow-ups, CSV validation/idempotency,
  alert deduplication, and responder authorization/idempotency.
- Frontend: add/edit/status flows, validation, empty/error states, and dashboard
  rendering using mocked responses.
- Integration: real PostgreSQL CRUD/import/metrics and migrations; Playwright
  creates an application, changes status, reloads, and verifies persisted data.
- Incident integration: fault → checker → alert → responder → verified recovery;
  unknown fault remains unresolved and unauthorized actions are rejected.
- Deployment evidence: public synthetic demo or clear recording, CI run links,
  dev/prod deployment configuration, rollback drill, and correlated telemetry.

`make test` supplies isolated test dependencies and documents required software.
Deployment drills and live-agent runs are separate, documented verification
commands; they are not hidden prerequisites for normal tests.

## 9. Task tracker, development agents, and context

Before implementation, create public GitHub issues with acceptance criteria
linked to this specification. Draft files or an issue creation script alone do
not count as a public tracker. Record agent issue assignments, implementation
notes, test results, and review outcomes in the tracker; link issues from commits
or pull requests. Never publish private job-search records in those notes.

Development roles and handoffs are documented in `docs/agents.md`:

- Product/planning agent: maintains scope, metric definitions, and issue criteria.
- Implementation agent: works an assigned issue and records changes and validation.
- Review/test agent: checks acceptance criteria, tests, privacy, and failure paths;
  reports gaps before the issue is closed.
- Human author: resolves product questions, reviews changes, and approves production.

Roles can be invoked sequentially; simultaneous agent execution is not required.
These development roles are distinct from the runtime checker and responder.

Root `AGENTS.md` summarizes the project and links to modular documentation:
`docs/spec.md`, `docs/agents.md`, `docs/process.md`, `docs/architecture.md`, and
`docs/runbook.md`. The repository copy of this specification is `docs/spec.md`.

## 10. Scope and effort budget (20 hours)

| Block                                                              |  Hours |
| ------------------------------------------------------------------ | -----: |
| Specification, public issues, agent/context docs, deployment spike |      2 |
| API, PostgreSQL schema, CSV import                                 |      3 |
| Frontend CRUD and dashboard                                        |      3 |
| Unit, frontend, and integration tests                              |      3 |
| Containers, CI/CD, deployment and rollback drill                   |      3 |
| Telemetry, checker, fault trigger, responder and recovery demo     |      5 |
| README, evidence links and demo recording                          |      1 |
| **Total**                                                          | **20** |

This is a timebox, not a guarantee. If infrastructure takes longer, reduce visual
polish and optional features before cutting required validation or recovery work.

Out of scope: email parsing, automatic applications, multi-user accounts, external
email/chat reminders, elaborate charts, arbitrary production self-repair, and
claims about employers' screening mechanisms. Public demo data is disposable;
private records remain local.

## 11. Submission checklist

- Link README, specification, public issues, agent/context docs, tests, deployment,
  rollback evidence, telemetry views, and the recorded incident recovery.
- Verify all claims against implemented behavior; do not mark planned work done.
- Complete reviews of three other participants' projects. Peer review is required
  to pass and is separate from implementation time.
- Confirm deadlines and submission workflow on the course platform.

## Implementation decisions for the free full-stack milestone

- HTTP/FastAPI/PostgreSQL is the default; mock mode is opt-in.
- The responder is a deterministic autonomous policy agent with fixed tools; it
  does not claim LLM reasoning or require paid inference.
- Render Free can run the complete application image. One free PostgreSQL instance
  uses separate dev/production schemas, with the documented 30-day expiration.
- The independent local checker runs every 30 seconds. An optional external GitHub
  checker can run at a slower free schedule, persisting state in PostgreSQL.
- Remote telemetry and cloud CD require account configuration and actual evidence;
  local config/tests alone do not prove they are active in the hosted environment.
