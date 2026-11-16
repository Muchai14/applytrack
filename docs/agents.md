# Agent team and handoffs

Workflow roles may be performed sequentially by one assistant. This project does
not claim concurrent agents or an independent human review where none occurred.

| Role             | Responsibility                                                            | Handoff                                 |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| Product/planning | Define acceptance criteria, metrics and free-only scope                   | Specification and public issue          |
| Implementation   | Build assigned behavior; preserve API/privacy boundaries                  | Issue-linked commit and notes           |
| Review/test      | Check real persistence, failure paths, tests and recovery evidence        | Test output, gaps and issue updates     |
| Human author     | Review product fit, complete account login and approve any access changes | Feedback and manual production dispatch |

Issues #2–#4 were read before backend/operations implementation. Progress notes
record the role, evidence and remaining deployment configuration. Requirements
are checked against running behavior, not mock screenshots.

Runtime agents are distinct from development roles:

- Checker: continuously checks dashboard availability from another process;
  persists streaks and raises deduplicated incidents.
- Responder: wakes for an incident, diagnoses through fixed tools, applies one
  allowlisted dev repair and verifies recovery; escalates unsupported failures.
- CI/CD: executes tests, gates dev releases and allows a manual production release.

Runtime remediation is deterministic and does not depend on an LLM. Human review
is required for unsupported operational decisions and production rollback.
