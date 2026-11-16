# Frontend runbook

## Build and serve

Run `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm build`. The deployable
static output is `dist/`. Serve via an HTTP server; opening index.html directly
from disk is not supported. Hash navigation does not require server-side routing.

## Demo state

Mock application state is in the `applytrack.demo.v1` localStorage key. Empty
state remains empty after the last record is deleted. If state is corrupted,
the UI displays an error instead of replacing it. A user can clear this key in
browser developer tools to restore seed records; this removes local demo edits.
Browser storage errors are surfaced and never reported as successful saves.

## API errors

If real API mode is enabled, confirm VITE_API_BASE_URL, backend health, and CORS.
Use the page's retry action after recovery. HTTP calls time out after 10 seconds.
Changing Vite variables requires a restart/rebuild. Mock incidents are not real
alerts and their reports must not be treated as production evidence.

## Release and rollback scope

GitHub CI validates the frontend. This milestone may be served as a private
static preview; full course dev/prod CD and rollback drills remain future work.
A frontend rollback requires building and deploying a prior source commit using
the same environment values. That procedure has not yet been demonstrated as a
full application rollback, and cannot restore a future database.
