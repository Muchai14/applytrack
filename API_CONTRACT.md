# Proposed FastAPI contract

All endpoints below use JSON. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.
Input validation must also be implemented on the server. See `src/types.ts` for
complete frontend types. The FastAPI implementation is in `backend/app/main.py`.

| Method | Route                             | Request                   | Success response |
| ------ | --------------------------------- | ------------------------- | ---------------- |
| GET    | /api/applications                 | —                         | Application[]    |
| POST   | /api/applications                 | ApplicationInput          | 201 Application  |
| PATCH  | /api/applications/{id}            | Complete ApplicationInput | 200 Application  |
| DELETE | /api/applications/{id}            | —                         | 204              |
| POST   | /api/applications/{id}/follow-ups | —                         | 204              |
| GET    | /api/dashboard                    | —                         | Dashboard        |
| POST   | /api/imports/preview              | `{ "csv": "..." }`        | ImportPreview    |
| POST   | /api/imports                      | `{ "csv": "..." }`        | ImportPreview    |
| GET    | /api/incidents                    | —                         | Incident[]       |

ApplicationInput: company, role, category, channel (nonempty strings, max 160
characters each), status (Applied/Interview/Rejected/Closed), applied_at,
and decision_at (nullable; required for Rejected).

Application adds: id, optional source_id, status_changed_at,
last_followed_up_at (nullable), created_at, updated_at. Status transitions update
the status clock; description-only changes do not. Leaving Rejected clears
its decision date. Follow-ups are allowed only for open applications.

Dashboard: total, open, interviews, rejected, median_days (nullable), counts
(object keyed by status), categories (name/total/rejected/rate), stale
(Application[]), and recent (up to five Application[], newest update first).

ImportPreview: rows (valid parsed Application[]), errors (row-numbered strings),
created, skipped, conflicts. Preview never writes. Commit revalidates against
current records. Validation errors abort all writes; conflicts leave existing
records unchanged while other valid new rows may be created. Enforce size/row
limits before expensive parsing and import transactionally.

CSV columns: source_id,company,role,category,channel,status,applied_at,
status_changed_at,last_followed_up_at,decision_at. Last three may be empty;
status_changed_at defaults to applied_at. Rejected rows require decision_at.
Historical dates must be between application date and today. Duplicate source
IDs within one file are validation errors.

Incident: id, environment, route, detected_at, resolved_at (nullable), status
(Investigating/Resolved/Needs attention), diagnosis, action, verification,
release_id, trace_id. Reports contain no personal application records.

Non-2xx responses reject the frontend operation and show a generic error with
HTTP status. The current client does not render server response bodies, avoiding
accidental display of internal details. The client uses a 10-second timeout.
Backend should use 404 for missing IDs, 422 for validation, and 503 for temporary
unavailability, with sanitized error bodies. Frontend base URL must not include
credentials. Authentication and multi-user access are out of scope.
