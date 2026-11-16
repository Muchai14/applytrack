import hmac
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode
from prometheus_client import generate_latest
from prometheus_client.openmetrics.exposition import CONTENT_TYPE_LATEST
from prometheus_client.openmetrics.exposition import generate_latest as openmetrics
from .config import Settings
from .db import Application, Incident, State, as_dict, connect, utcnow
from .domain import ApplicationInput, metrics, preview_import
from . import telemetry
from .auth import auth_router, csrf, session_user

class CsvBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    csv: str = Field(max_length=1048576)

class FaultBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


def create_app(settings=None):
    settings = settings or Settings()
    engine, sessions = connect(settings)
    telemetry.configure()
    tracer = trace.get_tracer("applytrack")
    @asynccontextmanager
    async def lifespan(app):
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        yield
        engine.dispose()
    app = FastAPI(title="ApplyTrack", version="0.3.0", lifespan=lifespan)
    app.state.sessions = sessions
    app.state.settings = settings

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        detail = "Check the username format and password length." if request.url.path.startswith("/api/auth/") else "Invalid input. Check required fields and dates."
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        telemetry.log_event("database_error", error_category="database_unavailable")
        return JSONResponse(status_code=503, content={"detail": "Data temporarily unavailable."})

    @app.middleware("http")
    async def observe(request: Request, call_next):
        started = time.perf_counter()
        status_code = 500
        with tracer.start_as_current_span("http.request", record_exception=False) as span:
            ctx = span.get_span_context()
            trace_id = f"{ctx.trace_id:032x}"
            try:
                response = await call_next(request)
                status_code = response.status_code
                response.headers["X-Trace-ID"] = trace_id
                if request.url.path.startswith("/api/"):
                    response.headers["Cache-Control"] = "no-store"
                return response
            finally:
                route = getattr(request.scope.get("route"), "path", "unmatched")
                # Do not record raw URLs, queries, bodies, credentials or validation inputs.
                span.update_name(f"{request.method} {route}")
                span.set_attribute("http.route", route)
                span.set_attribute("http.request.method", request.method)
                span.set_attribute("http.response.status_code", status_code)
                if status_code >= 500:
                    span.set_status(Status(StatusCode.ERROR))
                if route != "/metrics":
                    telemetry.requests.labels(route, request.method, str(status_code)).inc(exemplar={"trace_id": trace_id})
                    telemetry.duration.labels(route, request.method).observe(time.perf_counter()-started, exemplar={"trace_id": trace_id})
                    telemetry.log_event("http_request", route=route, method=request.method, status=status_code, release_id=settings.release_id)

    def session():
        with sessions() as db:
            yield db

    def authorize(request: Request):
        supplied = request.headers.get("authorization", "")
        if not settings.ops_token or not hmac.compare_digest(supplied, "Bearer "+settings.ops_token):
            raise HTTPException(401, "Management authorization required")

    app.include_router(auth_router(settings, session))

    def current_user(request: Request, db=Depends(session)):
        user = session_user(request, db)
        if user is None:
            raise HTTPException(401, "Sign in required")
        if request.method not in ("GET", "HEAD"):
            csrf(request, settings)
        return user

    def read_principal(request: Request, db=Depends(session)):
        supplied = request.headers.get("authorization", "")
        if settings.ops_token and hmac.compare_digest(supplied, "Bearer "+settings.ops_token):
            # Read-only monitoring sees only unowned synthetic/legacy rows.
            return None
        return current_user(request, db)

    def application_dict(row):
        return {k: v for k, v in as_dict(row).items() if k != "owner_id"}

    def get_application(db, app_id, user):
        row = db.get(Application, app_id)
        if row is None or row.owner_id != user.id:
            raise HTTPException(404, "Application not found")
        return row

    @app.get("/health")
    def health(db=Depends(session)):
        db.execute(text("SELECT 1"))
        return {"status": "ok", "release_id": settings.release_id, "auth_version": 1}

    @app.get("/metrics")
    def prometheus(request: Request):
        if "application/openmetrics-text" in request.headers.get("accept", ""):
            return Response(openmetrics(telemetry.registry), media_type=CONTENT_TYPE_LATEST)
        return Response(generate_latest(telemetry.registry), media_type="text/plain; version=0.0.4")

    @app.get("/api/applications")
    def applications(db=Depends(session), user=Depends(current_user)):
        with tracer.start_as_current_span("db.applications.list", record_exception=False):
            return [application_dict(a) for a in db.scalars(select(Application).where(Application.owner_id == user.id).order_by(Application.updated_at.desc()))]

    @app.post("/api/applications", status_code=201)
    def create(data: ApplicationInput, db=Depends(session), user=Depends(current_user)):
        now = utcnow()
        row = Application(**data.model_dump(mode="json"), id=str(uuid.uuid4()), owner_id=user.id, created_at=now, updated_at=now, status_changed_at=data.applied_at.isoformat())
        db.add(row)
        db.commit()
        return application_dict(row)

    @app.patch("/api/applications/{app_id}")
    def edit(app_id: str, data: ApplicationInput, db=Depends(session), user=Depends(current_user)):
        row = get_application(db, app_id, user)
        now = utcnow()
        if row.status != data.status:
            row.status_changed_at = now
        for key, value in data.model_dump(mode="json").items():
            setattr(row, key, value)
        row.updated_at = now
        db.commit()
        return application_dict(row)

    @app.delete("/api/applications/{app_id}", status_code=204)
    def delete(app_id: str, db=Depends(session), user=Depends(current_user)):
        db.delete(get_application(db, app_id, user))
        db.commit()
        return Response(status_code=204)

    @app.post("/api/applications/{app_id}/follow-ups", status_code=204)
    def follow_up(app_id: str, db=Depends(session), user=Depends(current_user)):
        row = get_application(db, app_id, user)
        if row.status not in ("Applied", "Interview"):
            raise HTTPException(422, "Only open applications can receive follow-ups")
        row.last_followed_up_at = row.updated_at = utcnow()
        db.commit()
        return Response(status_code=204)

    @app.get("/api/dashboard")
    def dashboard(db=Depends(session), user=Depends(read_principal)):
        fault = db.get(State, "dashboard_fault")
        if fault and fault.value.get("enabled") and settings.fault_enabled:
            raise HTTPException(503, "Dev fault injection active")
        with tracer.start_as_current_span("db.dashboard.read", record_exception=False):
            return metrics([application_dict(a) for a in db.scalars(select(Application).where(Application.owner_id == (user.id if user else None)))])

    @app.post("/api/imports/preview")
    def preview(data: CsvBody, db=Depends(session), user=Depends(current_user)):
        return preview_import(data.csv, [application_dict(a) for a in db.scalars(select(Application).where(Application.owner_id == user.id))])

    @app.post("/api/imports")
    def import_csv(data: CsvBody, db=Depends(session), user=Depends(current_user)):
        # Serialize imports across workers, including the initially empty database.
        if engine.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(6420091)"))
        existing = [application_dict(a) for a in db.scalars(select(Application).where(Application.owner_id == user.id))]
        result = preview_import(data.csv, existing)
        if result["errors"]:
            raise HTTPException(422, "Import blocked: fix all validation errors first")
        ids = {a["source_id"] for a in existing if a.get("source_id")}
        for row in result["rows"]:
            if row["source_id"] not in ids:
                db.add(Application(**row, owner_id=user.id))
        db.commit()
        return result

    @app.get("/api/incidents")
    def incidents(db=Depends(session), user=Depends(read_principal)):
        return [{k: v for k, v in as_dict(i).items() if k not in ("attempted", "active_key")} for i in db.scalars(select(Incident).order_by(Incident.detected_at.desc()).limit(100))]

    if settings.fault_enabled and settings.environment in ("dev", "test"):
        @app.post("/ops/fault", dependencies=[Depends(authorize)])
        def fault(data: FaultBody, db=Depends(session)):
            row = db.get(State, "dashboard_fault")
            if row is None:
                row = State(key="dashboard_fault", value={})
                db.add(row)
            row.value = {"enabled": data.enabled}
            db.commit()
            return {"enabled": data.enabled}

        @app.get("/ops/diagnostics", dependencies=[Depends(authorize)])
        def diagnostics(db=Depends(session)):
            flag = db.get(State, "dashboard_fault")
            return {"environment": settings.environment, "dashboard_fault": bool(flag and flag.value.get("enabled")), "release_id": settings.release_id}

    directory = Path(settings.frontend_dir)
    if directory.joinpath("index.html").exists():
        app.mount("/", StaticFiles(directory=directory, html=True), name="frontend")
    return app
