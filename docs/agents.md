# Agent team and handoffs

These are workflow roles; they may be performed sequentially by one assistant.
This milestone did not use concurrent agents or claim independent agent review.

| Role             | Responsibility                                                            | Handoff artifact                            |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| Product/planning | Define the problem, metric semantics, scope and acceptance criteria       | Specification and tracker issue             |
| Implementation   | Build the assigned behavior, keep API boundaries, document decisions      | Code, issue-linked commit, validation notes |
| Review/test      | Check acceptance criteria, failure paths, privacy and responsive behavior | Test results and review gaps in the issue   |
| Human author     | Resolve scope questions, review the product and approve production        | Product feedback and deployment approval    |

Runtime checker and responder are different components. They remain planned;
the incident screen currently demonstrates only their eventual report format.
