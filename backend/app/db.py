from datetime import datetime, timezone
import os
import re
from sqlalchemy import Boolean, JSON, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import Settings


def utcnow():
    return datetime.now(timezone.utc).isoformat()

class Base(DeclarativeBase):
    pass

class Application(Base):
    __tablename__ = "applications"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    company: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(160))
    channel: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20))
    applied_at: Mapped[str] = mapped_column(String(32))
    decision_at: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status_changed_at: Mapped[str] = mapped_column(String(40))
    last_followed_up_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))

class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    active_key: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    environment: Mapped[str] = mapped_column(String(20))
    route: Mapped[str] = mapped_column(String(80))
    detected_at: Mapped[str] = mapped_column(String(40))
    resolved_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(30))
    diagnosis: Mapped[str] = mapped_column(Text, default="Investigation pending.")
    action: Mapped[str] = mapped_column(Text, default="No remediation attempted.")
    verification: Mapped[str] = mapped_column(Text, default="Recovery not verified.")
    release_id: Mapped[str] = mapped_column(String(100), default="unknown")
    trace_id: Mapped[str] = mapped_column(String(64), default="")
    attempted: Mapped[bool] = mapped_column(Boolean, default=False)

class State(Base):
    __tablename__ = "system_state"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


def connect(settings: Settings):
    # Never print database URLs: they may contain credentials.
    url = settings.database_url
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    schema = os.getenv("DB_SCHEMA", "")
    if schema and not re.fullmatch(r"[a-z][a-z0-9_]{0,50}", schema):
        raise ValueError("Invalid DB_SCHEMA")
    engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5, hide_parameters=True, connect_args={"options": "-csearch_path="+schema} if schema else {})
    return engine, sessionmaker(engine, expire_on_commit=False)


def as_dict(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}
