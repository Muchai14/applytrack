"""Username authentication with salted password hashes and revocable opaque sessions."""
import hashlib
import hmac
import re
import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from .db import AuthThrottle, LoginSession, User, utcnow

COOKIE = "applytrack_session"
SESSION_AGE = 7 * 24 * 60 * 60
hash_slots = threading.BoundedSemaphore(2)

class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=1, max_length=128, repr=False)

    @field_validator("username")
    @classmethod
    def username_format(cls, value):
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9_]{3,24}", value):
            raise ValueError("Invalid username")
        return value

class Registration(Credentials):
    password: str = Field(min_length=12, max_length=128, repr=False)


def hash_password(password):
    salt = secrets.token_bytes(16)
    with hash_slots:
        key = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=3, maxmem=64*1024*1024, dklen=32)
    return "scrypt$"+salt.hex()+"$"+key.hex()


def verify_password(password, stored):
    try:
        algorithm, salt, expected = stored.split("$")
        if algorithm != "scrypt" or len(salt) != 32 or len(expected) != 64:
            return False
        with hash_slots:
            key = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768, r=8, p=3, maxmem=64*1024*1024, dklen=32)
        return hmac.compare_digest(key.hex(), expected)
    except (ValueError, TypeError):
        return False

# The same cost is paid for an unknown username; this is not an account password.
DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


def public_user(user):
    return {"id": user.id, "username": user.username}


def csrf(request, settings):
    if request.headers.get("x-requested-with") != "ApplyTrack":
        raise HTTPException(403, "Request verification failed")
    origin = request.headers.get("origin")
    expected = settings.public_origin.rstrip("/") or str(request.base_url).rstrip("/")
    if origin and origin != expected:
        raise HTTPException(403, "Request verification failed")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "Request verification failed")


def throttle(db, request, category):
    now = datetime.now(timezone.utc)
    # Store only hashed, expiring rate keys; never record these in telemetry.
    peer = request.client.host if request.client else "unknown"
    for identity, maximum, seconds in [(peer, 8 if category == "register" else 30, 3600 if category == "register" else 300), ("global", 120, 60)]:
        key = hashlib.sha256((category+":"+identity).encode()).hexdigest()
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": int(key[:15], 16)})
        row = db.get(AuthThrottle, key)
        if row is None:
            row = AuthThrottle(key=key, started_at=now.isoformat(), attempts=0)
            db.add(row)
        if now - datetime.fromisoformat(row.started_at) >= timedelta(seconds=seconds):
            row.started_at, row.attempts = now.isoformat(), 0
        if row.attempts >= maximum:
            db.commit()
            raise HTTPException(429, "Too many attempts. Please try again later.")
        row.attempts += 1
    db.execute(delete(AuthThrottle).where(AuthThrottle.started_at < (now-timedelta(days=2)).isoformat()))
    db.commit()


def session_user(request, db):
    token = request.cookies.get(COOKIE, "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    saved = db.get(LoginSession, digest)
    if saved is None:
        return None
    if saved.expires_at <= utcnow():
        db.delete(saved); db.commit()
        return None
    return db.get(User, saved.user_id)


def begin_session(user, db, response, settings, request):
    old = request.cookies.get(COOKIE, "")
    if old:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == hashlib.sha256(old.encode()).hexdigest()))
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now.isoformat()))
    db.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=(now+timedelta(seconds=SESSION_AGE)).isoformat()))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=SESSION_AGE, httponly=True, secure=settings.environment == "production" or settings.public_origin.startswith("https://"), samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"


def auth_router(settings, session):
    router = APIRouter(prefix="/api/auth")
    @router.get("/me")
    def me(request: Request, response: Response, db=Depends(session)):
        response.headers["Cache-Control"] = "no-store"
        user = session_user(request, db)
        return {"user": public_user(user) if user else None}

    @router.post("/register", status_code=201)
    def register(data: Registration, request: Request, response: Response, db=Depends(session)):
        csrf(request, settings); throttle(db, request, "register")
        user = User(id=str(uuid.uuid4()), username=data.username, username_key=data.username.lower(), password_hash=hash_password(data.password), created_at=utcnow())
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "That username is already taken") from None
        begin_session(user, db, response, settings, request)
        return {"user": public_user(user)}

    @router.post("/login")
    def login(data: Credentials, request: Request, response: Response, db=Depends(session)):
        csrf(request, settings); throttle(db, request, "login")
        user = db.scalar(select(User).where(User.username_key == data.username.lower()))
        matches = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
        if not matches or user is None:
            raise HTTPException(401, "Incorrect username or password")
        # Rotate the browser's old session rather than accepting a client-chosen ID.
        old = request.cookies.get(COOKIE, "")
        if old:
            db.execute(delete(LoginSession).where(LoginSession.token_hash == hashlib.sha256(old.encode()).hexdigest()))
        begin_session(user, db, response, settings, request)
        return {"user": public_user(user)}

    @router.post("/logout", status_code=204)
    def logout(request: Request, db=Depends(session)):
        csrf(request, settings)
        token = request.cookies.get(COOKIE, "")
        if token:
            db.execute(delete(LoginSession).where(LoginSession.token_hash == hashlib.sha256(token.encode()).hexdigest()))
            db.commit()
        response = Response(status_code=204, headers={"Cache-Control": "no-store"})
        response.delete_cookie(COOKIE, path="/", httponly=True, secure=settings.environment == "production" or settings.public_origin.startswith("https://"), samesite="lax")
        return response
    return router
