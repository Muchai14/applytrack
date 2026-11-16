# Full-stack validation evidence

Validation date: November 16, 2026 (America/Los_Angeles).
Public tracker: issues #2–#4 in https://github.com/Muchai14/applytrack/issues.

## Executed checks

`make test` passed against isolated Docker containers:

- 40 frontend/domain/mock/HTTP tests.
- 26 Python unit and real PostgreSQL integration tests, including restart
  persistence, transactional/concurrent imports, dev/production schema isolation,
  telemetry correlation, authorization, deduplication and recovery failures.
- 1 real Chromium Playwright UI → FastAPI → PostgreSQL flow, including refresh
  persistence and a rejected-status update.
- The Docker frontend build includes a strict TypeScript check.

The browser test exposed server-owned metadata in edit requests. The form and
HTTP adapter now explicitly submit only editable fields; a regression test checks
the boundary. An earlier test locator issue was also fixed.

## Live local operations

`docker compose up --build -d --wait` started all ten services. Prometheus targets
for the API/checker were up. Tempo search and Loki queries returned stored traces
and structured logs. These are real signals, not incident fixtures.

`make demo-incident` enabled the dev fault, observed a real 503, and waited for the
independent responder to disable the fault and verify two successful dashboard
requests. The sanitized persisted report is in
[evidence/incident-recovery.json](evidence/incident-recovery.json).

The runtime responder is deterministic policy-based automation, not an LLM. No
concurrent development agents or independent human reviewer are claimed.

Public deployment and native CI-gated CD were verified as recorded below.
Hosted telemetry remains unconfigured. Configuration files alone are not evidence
of an active cloud service.
The older private Sites URL is a frontend-only mock milestone, not this full-stack
deployment. Consult the release evidence for actual hosted URLs and status.

## Executed rollback drill

An intentionally broken dev candidate returned dashboard 503 while health stayed
available. Restoring the retained `applytrack-api:known-good` image returned the
dashboard to 200. PostgreSQL kept 3 applications before and after; no database
was dropped. See [evidence/rollback.json](evidence/rollback.json).

Stored telemetry query results are in [evidence/telemetry.json](evidence/telemetry.json).

## Verified public release and delivery

The dev and production Render Free services are publicly reachable without a
ChatGPT login. Their health endpoints reported tested commit
`9fdfbef9c9437fca3b8bb36e2ba1a6c793395417`.

- [Release CI](https://github.com/Muchai14/applytrack/actions/runs/43926500983) passed.
- Render recorded a native **Auto-Deploy** event for dev after checks passed.
- A record written before that deployment remained in PostgreSQL afterwards.
- Production stayed on the previous release until a specific tested commit was
  manually selected; Render recorded **Manually deployed via Dashboard** and Live.
- Dev has 4 records and production 3, demonstrating independent schema contents.
- The public production dashboard was opened in a browser and rendered real data.

[Public application screenshot](evidence/public-application.jpg) ·
[Grafana screenshot](evidence/observability.jpg) ·
[Deployment metadata](evidence/deployment.json)

Hosted request logs exist in Render. Remote trace/log collection and the optional
external cloud checker are not configured; the correlated stored telemetry and
autonomous recovery evidence is from the complete local Compose stack.

## Account extension validation (issue #5)

The account changes add registration/login/logout, per-user query caches and
server ownership checks. The historical test counts/releases above predate this
extension. Current account test/deployment results are recorded separately after
verification; planned checks are not marked as passing.

### Executed account checks

`make test` passed: 45 frontend/domain/API tests, 34 Python/real-PostgreSQL tests,
and 1 Chromium full-stack flow (80 total). The browser flow registers a username,
creates/edits a persisted application, reloads, verifies identity, logs out across
two tabs and signs in again case-insensitively. Backend tests cover salted hashes,
revoked/expired sessions, cookie security, CSRF, rate limits, cross-account access
and per-owner CSV source IDs. The migration preserves unowned legacy records.

The session and ownership tests use disposable test credentials only. Passwords,
usernames and raw session tokens were verified absent from application telemetry.
Cloud rollout of this account extension is recorded after verification; historical
release screenshots above still show the earlier shared demo.

### Verified account release

Account source `92db0d10223ad45dbc8cc614f3dcaa23abaa7f97` passed
[full-stack CI](https://github.com/Muchai14/applytrack/actions/runs/43939744763),
auto-deployed to dev and was manually deployed to production. Both health endpoints
reported `auth_version=1` and that source commit.

Disposable test accounts verified online registration (201), Secure/HttpOnly/
SameSite cookies, empty new workspaces, case-insensitive login, logout revocation,
persistence across logout/login and blocked cross-account reads/writes (404).
Temporary test applications were removed; no personal account or password was
created on the author's behalf. The production signup UI was opened in a browser.

[Account evidence](evidence/accounts.json) ·
[Signup screenshot](evidence/account-signup.jpg) ·
[Post-auth local recovery drill](evidence/account-incident-recovery.json)

The post-auth recovery drill confirms the independent checker still repairs the
known dev fault using its read-only synthetic monitoring scope. Cloud continuous
monitoring remains optional/unconfigured. Free database retention and the absence
of a password-reset flow still apply.
