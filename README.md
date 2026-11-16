# ApplyTrack

ApplyTrack gives each registered job seeker a personal workspace to keep scattered
application records in one place,
review outcomes by role category, and notice applications needing follow-up.
Users can create/edit/delete applications, change status, record follow-ups,
import CSV records, and review a database-backed dashboard and incident history.

[Public task tracker](https://github.com/Muchai14/applytrack/issues) ·
[Specification](docs/spec.md) · [Architecture](docs/architecture.md) ·
[Validation evidence](docs/validation.md)

## Hosted full-stack demo

- [Production](https://applytrack-production-jvw0.onrender.com)
- [Development](https://applytrack-dev.onrender.com)

Both use real PostgreSQL with separate schemas. No ChatGPT login is required.
Create an ApplyTrack username/password account to access your own applications.
The old private Sites preview belongs to the earlier mock-only milestone.
Free services may take about a minute to wake after inactivity.

## Run the complete system

Prerequisite: Docker Desktop (or Docker Engine with Compose), with sufficient
memory for the local observability stack. No paid service or model is required.

```sh
docker compose up --build -d --wait
```

Open **http://localhost:8080**. The frontend calls FastAPI, which persists data in
**PostgreSQL**. The default application does not use browser storage. Database
migrations run on startup. New accounts start with an empty workspace. CRUD
changes survive API/container restarts and are shared across browsers.

- Application: http://localhost:8080
- API health: http://localhost:8000/health
- Grafana: http://localhost:3000 (`admin` / `local-demo-only`)
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093

These ports bind to loopback only. Default credentials are for the isolated local
demo; cloud deployment uses a generated management token. The public application requires registration/login and isolates application records
by account. It remains a course demo with limited retention, not a production
service for sensitive records. `docker compose down` stops services and preserves named volumes.

## Tests: one command

```sh
make test
```

This builds isolated test containers, runs frontend/domain/mock/HTTP tests,
Python unit and real-PostgreSQL integration tests, then a Chromium Playwright
UI → API → PostgreSQL flow. It starts its own test database and cleans up only
that test stack. No development data is touched. The Python fixtures refuse to
reset any database whose name does not end in `_test`.

The Playwright flow creates an application through the UI, verifies it through
the real API, changes its status, reloads the page and verifies persistence.
GitHub CI runs the same command on pull requests and main-branch pushes.

## Accounts

Choose a unique username (3–24 letters, numbers or underscores) and a password
(12–128 characters). Username matching is case-insensitive; the UI preserves your
chosen capitalization. Registration signs you in and your username appears in
the workspace/header. Log out using the account button. No email is collected.

Passwords use salted scrypt hashes. Opaque seven-day sessions are stored server-
side; the browser receives only an HttpOnly, SameSite cookie, Secure on hosted
HTTPS. Passwords and session tokens are never stored in localStorage or telemetry.
Server-side ownership checks cover CRUD, dashboard metrics, follow-ups and CSV
imports. Source IDs are unique within your own account. Legacy shared demo rows
are preserved as unowned data and are not assigned to a new registrant.

There is no password-reset or account-recovery flow yet. Keep your password safe.
Authentication has bounded rate limits and same-origin/custom-header verification.

## Features and exact behavior

- Statuses: Applied, Interview, Rejected, Closed. Only Applied/Interview are open.
- Rejection share: currently rejected / all records in that category, including
  open and closed records. It is descriptive, not a hiring prediction.
- Rejection median: elapsed days for currently rejected records; null if none.
- Stale: open and at least 21 days since the latest application date, status
  transition or explicit follow-up. Description edits do not reset this clock.
- Dates are UTC; server validation rejects future/invalid/reversed dates.
- CSV has a stable source_id, a 1 MB / 1,000-row limit, preview and validation.
  Identical imports skip records; conflicts do not overwrite existing records.
  Other valid new rows may import; any invalid row blocks the entire transaction.
  Concurrent imports are serialized with a PostgreSQL transaction lock.

See [API_CONTRACT.md](API_CONTRACT.md) for routes and payloads. The HTTP client is
centralized in `src/api/http.ts`. The standalone mock adapter remains available
only when explicitly enabled with `VITE_USE_MOCK_API=true`; its incidents are
clearly labeled simulated. Docker and Render builds default to the real API.

## Observe user impact and demonstrate automatic recovery

The dashboard request produces an HTTP span, a database-operation child span,
structured JSON logs, request/latency metrics and trace exemplars. Logs and traces
share a trace ID. No bodies, CSV contents, company/role names, credentials, raw
URLs or user IDs are sent to telemetry. The Collector sends traces to Tempo and
logs to Loki; Prometheus stores metrics. Grafana data sources and the **ApplyTrack
· User impact** dashboard are provisioned automatically.

The checker is a separate service. Two consecutive invalid/unreachable/5xx
dashboard checks trigger one persisted incident. A constrained autonomous
**policy-based responder** investigates using authenticated fixed tools. For a
known dev fault it disables the fault flag and verifies two successful checks.
Unknown faults and failed repairs escalate to the incident view without repeated
repair attempts. This is deterministic automation, not a claim of LLM reasoning;
no model API or paid inference is required.

```sh
make demo-incident
```

This enables a dev-only dashboard 503 fault, waits for the independent checker,
and prints the real resolved incident. The application data stays unchanged.
Production rejects fault injection at configuration time and has no fault routes.
Alertmanager can also wake the responder from user-impact alert rules.
See [runbook](docs/runbook.md) and [recorded incident evidence](docs/evidence/incident-recovery.json).

## Free deployment, CI/CD and rollback

[Render blueprint](render.yaml) requests only Free services, serves the frontend
from FastAPI, and uses distinct dev/production PostgreSQL schemas. Full setup,
free-tier limits, required GitHub secrets/variables and deployment verification
are documented in [free-deployment.md](docs/free-deployment.md).

CI tests first; Render’s connected GitHub integration automatically deploys dev
only after checks pass. Production auto-deploy is off and uses a manual release
of a tested commit. An optional API-driven GitHub release workflow is also
included; its jobs skip until configured and are not the default CD path.

```sh
make rollback IMAGE=applytrack-api:known-good
```

The image must already exist. This restores the API/responder image without
dropping the database. The runbook also covers Render's prior-deployment rollback.
Account migration 0002 preserves existing records, but pre-account images must
never be restored: they cannot enforce ownership. Local rollback rejects images
without the account-security label. Image rollback does not restore data.

**Free hosting limits:** Render web services sleep after inactivity and the Free
PostgreSQL database expires after 30 days. Keep exports or connect a separately
provisioned free PostgreSQL provider for longer retention. No paid upgrade is
required or authorized. See [Render's current limits](https://render.com/docs/free).

## Context and review

[AGENTS.md](AGENTS.md) points to modular process, role, architecture and runbook
docs. Public issues record acceptance criteria, implementation notes and actual
validation; issue-linked commits provide tracker evidence. Original frontend
bootstrap timing is documented honestly in [process.md](docs/process.md).

The course also requires reviewing three other participants' projects. Completing
this application alone does not satisfy that peer-review requirement.
