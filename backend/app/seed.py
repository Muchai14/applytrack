from datetime import datetime, timedelta, timezone
from sqlalchemy import select, text
from .config import Settings
from .db import Application, connect, utcnow


def seed():
    settings = Settings()
    if not settings.seed_demo:
        return
    engine, sessions = connect(settings)
    with sessions() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(6420091)"))
        # Preserve an intentionally emptied workspace by storing a seed marker.
        from .db import State
        if db.get(State, "demo_seeded") is not None:
            return
        records = [("Example Labs", "Data Analyst", "Data", "Applied", 26), ("Orbit Studio", "Product Designer", "Design", "Interview", 4), ("Northstar Demo", "Frontend Engineer", "Engineering", "Rejected", 20)]
        today = datetime.now(timezone.utc).date()
        for i, (company, role, category, status, age) in enumerate(records):
            applied = (today-timedelta(days=age)).isoformat()
            db.add(Application(id=f"seed-{i}", source_id=f"demo-{i}", company=company, role=role, category=category, channel="Company website", status=status, applied_at=applied, decision_at=(today-timedelta(days=10)).isoformat() if status == "Rejected" else None, status_changed_at=applied, last_followed_up_at=None, created_at=utcnow(), updated_at=utcnow()))
        db.add(State(key="demo_seeded", value={"done": True}))
        db.commit()
    engine.dispose()

if __name__ == "__main__":
    seed()
