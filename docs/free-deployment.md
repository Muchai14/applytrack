# Free Render deployment and release setup

The project never requires a paid model, paid worker, or paid hosting plan.
`render.yaml` requests only Free web services and one Free PostgreSQL instance.
Dev and production use separate PostgreSQL schemas inside that database.

## Free-tier limits (checked November 16, 2026)

Render Free web services sleep after 15 idle minutes and may take about a minute
to wake. Free hours are shared across services. Free PostgreSQL expires after
30 days and has no managed backups. Free rollback history is limited to the two
most recent previous deploys. These are demo constraints, not production SLAs.
See https://render.com/docs/free for current terms and account quotas.

Do not add a payment method or upgrade a plan for this project. If your existing
workspace already has billing enabled, review its spend limit and usage before
creating services; Free compute does not make bandwidth/build overages free.
Stop if Render proposes a paid resource. For longer-lived free persistence,
a separately provisioned Neon Free PostgreSQL connection can replace DATABASE_URL;
keep dev and production schemas separate. Neon limits are documented at
https://neon.com/docs/introduction/plans.

## First deployment

1. Sign in to your existing Render account and connect the public GitHub repo.
2. Create a Blueprint from `render.yaml`. Review every resource as **Free**.
3. Deploy the database and the two web services. Do not supply any private job
   application data; the services seed synthetic records only.
4. Verify both `/health` and `/api/dashboard`, then create a record, reload, and
   verify it survives a service redeploy. The frontend is served by FastAPI from
   the same origin and uses the real HTTP adapter by default.
5. The initial Blueprint deployment is a bootstrap. The dev service uses Render’s native **After CI Checks Pass** integration.
   Production auto-deploy is disabled and requires a manual release.

The blueprint creates only what it declares; it does not configure GitHub secrets,
prove CI/CD, or configure a remote telemetry collector automatically.

## GitHub CI/CD

The default path uses the connected GitHub provider: Render dev auto-deploys only
after repository CI checks pass (`autoDeployTrigger: checksPass`). Production is
manual (`off`); use Render’s **Deploy a specific commit** action with the tested
SHA. This path needs no account-wide Render API key in GitHub. It requires a
connected Git provider, not an unauthenticated public-repository URL connection.
See https://render.com/docs/deploys.

The GitHub workflow also supports an optional explicit API-driven release path.
Only configure the following secrets if you choose that mode; disable native dev
auto-deploy first to avoid duplicate deployments.

Create repository variables `RENDER_DEV_SERVICE_ID`, `RENDER_PROD_SERVICE_ID` and
secret `RENDER_API_KEY` using GitHub's secure settings. Do not paste keys in issues,
source, or chat. Use a token scoped to the required services where available.

A push to main runs all tests, then deploys the exact tested commit to dev if the
service ID is configured. Production is a separate manual workflow dispatch with
`environment=production`. Add required reviewers to the `production` GitHub
Environment if supported by your account. Tests run again for the selected ref.
Without those variables/secrets the deployment jobs skip; that is not evidence
of completed CD.

API references:
https://api-docs.render.com/reference/create-deploy
https://api-docs.render.com/reference/rollback-deploy

## Independent checker without a paid worker

The optional scheduled GitHub workflow runs outside the API process. Enable only
when you want ongoing checks, after configuring `CLOUD_CHECKER_ENABLED=true`,
`RENDER_DEV_URL`, secret `CHECKER_DATABASE_URL` (external DB connection), and secret
`DEV_OPS_TOKEN`. It persists consecutive failures and incidents in the dev schema.
Two failed scheduled runs open an incident; GitHub schedules can be delayed.

The local Compose checker runs every 30 seconds. The free cloud checker runs every
10 minutes, so detection latency differs. Cold starts and provider downtime may
produce an unresolved incident; the responder does not try to repair the provider.
Keep the cloud schedule disabled when not reviewing to conserve shared free hours.

## Rollback

Local: `make rollback IMAGE=applytrack-api:known-good` restores an existing image
without changing the database. Before a new build, tag the current image with a
release name and keep it until the drill is complete.

Render: set `RENDER_API_KEY` and `RENDER_SERVICE_ID` securely, then run:

```sh
python3 scripts/render_deploy.py rollback --deploy-id dep-PREVIOUS_ID
```

Use an actual retained deployment ID from Render; the placeholder is not runnable.
This reuses the previous deployment artifact rather than rebuilding main. Pause dev auto-deploys before a rollback drill and avoid new pushes during the drill.
Production auto-deploys are already disabled.
Migrations preserve records; only account-compatible images may be restored after
migration 0002. Rollback is not database restoration. Export important
records before the free database expires.

## Telemetry

The full local collector/Grafana stack is included in `docker compose up`.
For hosted telemetry, configure an authenticated collector separately using
`OTEL_EXPORTER_OTLP_ENDPOINT`. Never expose the local unauthenticated collector
on the public internet. Hosted collection is not claimed until verified. A
recorded local dashboard/trace/log demonstration can accompany the deployment.

## Account release upgrade

The account feature uses the existing PostgreSQL instance and no paid identity
provider. Alembic migration 0002 preserves the old unowned demo rows. New accounts
are isolated and empty; usernames/accounts in dev and production are also separate.
Render automatically supplies the HTTPS public origin used for cookie/CSRF checks.
Never roll back to a pre-account image after users register. The valid rollback
baseline must contain ownership checks and the account-security image label.
