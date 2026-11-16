# ApplyTrack agent context

ApplyTrack is a single-user job application tracker. Current milestone is the
mock-only React frontend; do not claim full-stack deployment or incident recovery.
All documentation and UI text must be English. Use synthetic sample data only.

Read these modular docs before working:

- [Specification](docs/spec.md): intended behavior and full project criteria.
- [Architecture](docs/architecture.md): boundaries and current implementation.
- [Agent roles](docs/agents.md): responsibilities and handoffs.
- [Process](docs/process.md): tracker workflow and verification.
- [Runbook](docs/runbook.md): frontend operations and planned backend work.
- [API contract](API_CONTRACT.md): FastAPI integration boundary.

All backend access belongs in `src/api/`. Keep domain calculations testable in
`src/domain.ts`. Components use the `Api` interface through TanStack Query.
Preserve storage failure messages and never silently overwrite corrupted data.
Run `pnpm test` and `pnpm build` before declaring a code change complete.
Never add real job-search records, secrets, or generated node_modules to Git.
Do not introduce backend services or authentication without an explicit task.
