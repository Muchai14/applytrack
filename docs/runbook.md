# Operations runbook

## Start, test and stop

- `docker compose up --build -d --wait`: start the complete system.
- `make test`: isolated unit/frontend/PostgreSQL/browser checks and test cleanup.
- `docker compose ps`: inspect service state.
- `docker compose down`: stop without deleting application data.

Do not run `down --volumes` on the development project unless you intend to erase
its database and telemetry. The test script only deletes its own isolated stack.

## Dashboard unavailable

1. Check `/health` and the external availability metric.
2. Open Grafana's ApplyTrack dashboard. Inspect failure/latency metrics, then
   use a log's trace_id or exemplar to open the correlated Tempo trace.
3. Inspect the persisted incident report. No private application records belong
   in diagnostics. Do not paste connection URLs or credentials into an issue.
4. The responder only fixes the known dev fault flag. Unknown failures, database
   unavailability and provider cold starts require human investigation.

## Reproduce an alert and real repair

Run `make demo-incident` while the Compose checker is running. It enables the
protected dev fault, confirms 503, waits for a new incident and checks resolution.
The checker polls every 30 seconds; the drill can take about a minute. The API's
health/control endpoints remain reachable. Two valid dashboard responses are
required after repair. Inspect the report in Service incidents.

The standalone local OPS_TOKEN is a demo value. If overriding it, update the
Alertmanager webhook credential to match. Render generates a different secret;
never reuse the local sample value on an internet-facing deployment.

Production startup rejects ENABLE_FAULT_TRIGGER=true, and production has no
fault/control routes. Never enable dev remediation in production.

## Roll back a release

Before a new build, tag the current API image, e.g.:

```sh
docker image tag applytrack-api:local applytrack-api:known-good
```

After a failed release, `make rollback IMAGE=applytrack-api:known-good` recreates
the API/responder from that retained image, preserves PostgreSQL, and checks health.
The frontend is included in the API image for Render; local Nginx is a separate
image and can be restored independently if its assets changed. A release drill
must include both where necessary. Migration 0002 preserves data but requires account-compatible rollback images.

For hosted rollback use `scripts/render_deploy.py rollback --deploy-id ...` or
Render's rollback UI. See free-deployment.md for required secure configuration
and the free plan's limited retained deployment history.

## Backup and expiration

Export the local database before destructive maintenance:

```sh
docker compose exec -T db pg_dump -U applytrack -d applytrack > applytrack-backup.sql
```

This may contain private records: keep the file outside Git and public artifacts.
Restore to a separate empty database and verify it before replacing any live data.
Render Free PostgreSQL expires after 30 days and provides no managed backups.
Do not claim image rollback restores application records.

## Deployment verification

Confirm `/health` reports the tested release ID, `/api/dashboard` returns valid
data, and UI-created records survive refresh/redeploy. Keep cloud deployment,
CI/CD and remote telemetry evidence separate from local verification. If a job
skips for missing account secrets, document it as unconfigured.

## Account operations and rollback security boundary

Users register their own username/password in the application. Do not create
personal credentials on their behalf. New accounts are empty; pre-account shared
records are preserved as unowned and are not claimable through the API.

There is no password reset, email recovery or account deletion endpoint in this
version. A forgotten password cannot be recovered through the UI. Sessions expire
after seven days; logout revokes the current session immediately. Authentication
errors and rate-limit responses must not include credentials or raw input.

For custom same-origin hosting, set PUBLIC_ORIGIN to the exact HTTPS origin.
Render's RENDER_EXTERNAL_URL is used automatically. Local HTTP development uses
non-Secure cookies; hosted HTTPS uses Secure cookies. All browser writes require
X-Requested-With: ApplyTrack. Do not enable permissive credentialed CORS.

**Never restore a pre-account release after migration 0002.** Earlier application
images cannot enforce ownership. Local rollback requires the image label
`org.applytrack.auth-version=1`; retag a tested account-compatible image as the
new known-good baseline. For Render, select only a release containing account
security. The previous pre-account rollback evidence is historical, not permission
to use that image with current customer records.

`make demo-incident` now uses the existing management token for read-only synthetic
checks and incident reports. The checker does not need a customer's credentials.
