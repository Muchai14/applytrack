# ApplyTrack agent context

ApplyTrack is a job application tracker with username accounts and per-user records. The user authorized upgrading
the original mock frontend into a full-stack course project, using free services
only. Do not activate paid hosting, inference, or account upgrades.

Read these modular docs before working:

- [Specification](docs/spec.md): behavior and course acceptance criteria.
- [Architecture](docs/architecture.md): boundaries and current components.
- [Agent roles](docs/agents.md): responsibilities and handoffs.
- [Process](docs/process.md): tracker workflow and required checks.
- [Runbook](docs/runbook.md): operational commands and recovery limits.
- [API contract](API_CONTRACT.md): frontend/backend interface.
- [Free deployment](docs/free-deployment.md): configuration and account limits.

Use English for UI and docs, synthetic records for demos, and no secrets in Git,
issues or telemetry. Components access data only through `src/api/`; FastAPI is
authoritative for business validation and writes. PostgreSQL is mandatory in
integration tests; test fixtures refuse non-test database names. Use additive
migrations. Production must never expose fault injection or arbitrary repair tools.

Before release run `make test`; it includes frontend tests, backend unit/real-DB
integration tests and a browser flow. Inspect telemetry and exercise the dev
incident drill for operational changes. Do not claim deployment/CD/telemetry was
verified merely because a configuration file exists; link actual evidence.

Account scope was explicitly authorized in issue #5. All application reads/writes
and imports must enforce ownership on the server. No passwords or raw session
tokens in storage artifacts, logs, traces or localStorage. The availability checker
uses a read-only management credential and sees only unowned synthetic records.
Do not roll back to pre-account images after account creation; they bypass ownership.
