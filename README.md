# ApplyTrack

A personal job application tracker that brings scattered records into one place.
Review your pipeline, spot applications needing follow-up, and understand outcomes
by role category without rebuilding spreadsheet summaries each week.

[Source repository](https://github.com/Muchai14/applytrack) · [Public task tracker](https://github.com/Muchai14/applytrack/issues)

## Current delivery: interactive frontend

React + TypeScript + Vite, TanStack Query, Lucide icons, and plain CSS. All user
interface and project documentation are in English. No backend, authentication,
real monitoring, or autonomous repairs are implemented in this milestone.

- Create, edit, delete, and change application status.
- Search company/role and filter status/category.
- Computed summary cards, pipeline counts, rejection share, and rejection median.
- Stale open applications and explicit follow-up recording.
- CSV preview, validation, idempotent import, and conflict reporting.
- Read-only simulated incident reports with diagnosis and recovery evidence.
- Responsive navigation, native accessible dialogs, form validation, retry states.

The demo seeds 16 **synthetic** applications on first use. Mock changes persist in
this browser's localStorage. Clearing browser data resets the workspace. There is
no cross-device sync. Incident records are illustrative fixtures, not live events.
Do not use real personal records in a public demonstration.

## Run locally

Prerequisites: Node.js 22 or later and pnpm 10.11.0 (`corepack enable` if available).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the Local URL printed by Vite. The mock API is enabled by default; no
credentials, environment file, or running database is required.

```sh
pnpm test       # all domain, mock/HTTP adapter, and frontend flow tests
pnpm build      # strict TypeScript check and production build
pnpm preview    # serve the production build locally
```

CI runs the same tests and build on pushes and pull requests. Frontend tests use
jsdom with real mock storage; these are not full-stack or browser E2E tests.

## Connect a future FastAPI backend

Copy `.env.example` to `.env.local` and set:

```dotenv
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000
```

Restart Vite (or rebuild the deployed frontend). API selection is centralized in
`src/api/index.ts`; HTTP and mock implementations conform to the `Api` interface.
No components call `fetch` or localStorage directly. The backend must implement
[API_CONTRACT.md](API_CONTRACT.md), validation, and appropriate CORS. Vite
variables are public build-time configuration; never put credentials in them.

## Metric definitions

- Open = Applied + Interview. Rejected and Closed are terminal.
- Rejection share = currently rejected / all applications in a category, including
  pending and closed records. It is not a prediction of final outcomes.
- Median days to rejection includes currently rejected records with decision dates.
- Stale = open with at least 21 days since the most recent application date,
  actual status transition, or explicit follow-up. Description edits do not reset it.
- Dates display in UTC. Decision dates must be between application date and today.

CSV uses stable source IDs. Identical imports are skipped; existing source IDs
with changed data are conflicts and stay unchanged. Other valid new records may
be imported. Any validation error blocks the entire write. Limits: 1 MB, 1,000 rows.
An example CSV can be downloaded on the Import page.

## Project context and next milestones

[Full specification](docs/spec.md) describes the **target full-stack project**;
its acceptance criteria are not a claim that future backend/operations work is
complete. See [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md),
[agent roles](docs/agents.md), [process](docs/process.md), and
[runbook](docs/runbook.md).

Future milestones: FastAPI + PostgreSQL, full-stack tests, Docker Compose,
automated dev/manual production CD, request-correlated telemetry, an independent
checker, and an allowlisted responder with a real recovery demonstration.
