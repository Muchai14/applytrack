# Development process

1. Pick a public tracker issue with concrete acceptance criteria.
2. Record the responsible workflow role and relevant spec section.
3. Implement the smallest complete change, preserving the mock/HTTP boundary.
4. Run relevant tests; for frontend releases run all tests and the production build.
5. Inspect representative responsive UI states when browser tooling is available.
6. Record actual results, remaining limits, and commit/PR references in the issue.
7. Close only completed scope; keep backend and operations work explicitly open.

Initial specification predates implementation. The initial frontend bootstrap
was written locally before repository/tracker setup. Do not retroactively claim
that those changes were driven by pre-existing public issues. Subsequent work
and validation should reference actual issue numbers.
