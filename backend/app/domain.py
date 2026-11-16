import csv
import io
import statistics
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

STATUSES = ("Applied", "Interview", "Rejected", "Closed")

class ApplicationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    company: str = Field(min_length=1, max_length=160)
    role: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=160)
    channel: str = Field(min_length=1, max_length=160)
    status: Literal["Applied", "Interview", "Rejected", "Closed"]
    applied_at: date
    decision_at: date | None = None

    @field_validator("applied_at", "decision_at", mode="before")
    @classmethod
    def strict_dates(cls, v):
        if v is not None and (not isinstance(v, str) or len(v) != 10):
            raise ValueError("Use YYYY-MM-DD dates")
        return v

    @model_validator(mode="after")
    def validate_dates(self):
        today = datetime.now(timezone.utc).date()
        if self.applied_at > today:
            raise ValueError("Application date cannot be in the future")
        if self.status == "Rejected":
            if self.decision_at is None or not self.applied_at <= self.decision_at <= today:
                raise ValueError("Rejection date must be between application date and today")
        else:
            self.decision_at = None
        return self


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=timezone.utc) if value else None


def activity(a):
    return max(timestamp(a[k]) for k in ("applied_at", "status_changed_at", "last_followed_up_at") if a.get(k))


def metrics(rows, now=None):
    now = now or datetime.now(timezone.utc)
    counts = {s: sum(a["status"] == s for a in rows) for s in STATUSES}
    durations = [(date.fromisoformat(a["decision_at"]) - date.fromisoformat(a["applied_at"])).days for a in rows if a["status"] == "Rejected" and a.get("decision_at")]
    categories = []
    for name in sorted({a["category"] for a in rows}):
        group = [a for a in rows if a["category"] == name]
        rejected = sum(a["status"] == "Rejected" for a in group)
        categories.append(dict(name=name, total=len(group), rejected=rejected, rate=rejected/len(group)))
    return dict(total=len(rows), open=counts["Applied"]+counts["Interview"], interviews=counts["Interview"], rejected=counts["Rejected"], median_days=statistics.median(durations) if durations else None, counts=counts, categories=categories,
                stale=sorted([a for a in rows if a["status"] in ("Applied", "Interview") and now-activity(a) >= timedelta(days=21)], key=activity),
                recent=sorted(rows, key=lambda a: a["updated_at"], reverse=True)[:5])

CSV_COLUMNS = ("source_id", "company", "role", "category", "channel", "status", "applied_at", "status_changed_at", "last_followed_up_at", "decision_at")


def preview_import(text, existing):
    result = dict(rows=[], errors=[], created=0, skipped=0, conflicts=0)
    if len(text.encode("utf-8")) > 1024*1024:
        result["errors"].append("File exceeds the 1 MB limit.")
        return result
    try:
        reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")), strict=True)
        if not reader.fieldnames or any(k not in reader.fieldnames for k in CSV_COLUMNS[:7]):
            raise ValueError("Missing required CSV columns.")
        if len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("Duplicate CSV headers are not allowed.")
        seen = set()
        old_by_id = {a["source_id"]: a for a in existing if a.get("source_id")}
        for i, raw in enumerate(reader, 2):
            if i > 1001:
                raise ValueError("File exceeds the 1,000 row limit.")
            try:
                if None in raw or any(v is None for v in raw.values()):
                    raise ValueError("Column count does not match the header.")
                row = {k: v.strip() for k, v in raw.items()}
                source_id = row["source_id"]
                if not source_id or len(source_id) > 160 or source_id in seen:
                    raise ValueError("source_id must be unique within the file and 1–160 characters.")
                seen.add(source_id)
                data = {k: row[k] for k in CSV_COLUMNS[1:7]}
                data["decision_at"] = row.get("decision_at") or None
                a = ApplicationInput.model_validate(data).model_dump(mode="json")
                for key in ("status_changed_at", "last_followed_up_at"):
                    v = row.get(key) or (a["applied_at"] if key == "status_changed_at" else None)
                    if v and (len(v) != 10 or not date.fromisoformat(a["applied_at"]) <= date.fromisoformat(v) <= datetime.now(timezone.utc).date()):
                        raise ValueError("Historical dates must be between application date and today.")
                    a[key] = v
                now = datetime.now(timezone.utc).isoformat()
                a.update(id=str(uuid.uuid4()), source_id=source_id, created_at=now, updated_at=now)
                result["rows"].append(a)
                old = old_by_id.get(source_id)
                if old is None:
                    result["created"] += 1
                elif all((old.get(k) or "")[:10] == (a.get(k) or "")[:10] if k.endswith("_at") else old.get(k) == a.get(k) for k in CSV_COLUMNS[1:]):
                    result["skipped"] += 1
                else:
                    result["conflicts"] += 1
            except (ValueError, KeyError, TypeError):
                # Never echo uploaded content or Pydantic's raw-input error strings.
                result["errors"].append(f"Row {i}: invalid application, date, column count or duplicate source_id.")
        if not seen:
            result["errors"].append("The file contains no application rows.")
    except (ValueError, csv.Error):
        result["errors"].append("Invalid CSV: check required headers, quoting and the 1,000 row limit.")
    return result
