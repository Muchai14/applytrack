import os
import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from fastapi.testclient import TestClient
from app.config import Settings
from app.db import connect
from app.main import create_app

@pytest.fixture
def settings():
    url = os.environ.get('TEST_DATABASE_URL', os.environ.get('DATABASE_URL', ''))
    if not url or not make_url(url).database.endswith('_test'):
        pytest.fail('Tests require an isolated PostgreSQL database whose name ends in _test')
    return Settings(database_url=url, environment='test', ops_token='test-ops-token-at-least-24-characters', fault_enabled=True, release_id='test-release', frontend_dir='/nonexistent')

@pytest.fixture
def sessions(settings):
    engine, factory = connect(settings)
    assert engine.dialect.name == 'postgresql', 'Integration tests must use real PostgreSQL'
    with engine.begin() as db:
        db.execute(text('TRUNCATE applications, incidents, system_state, login_sessions, auth_throttle, users CASCADE'))
    yield factory
    engine.dispose()

@pytest.fixture
def client(settings, sessions):
    with TestClient(create_app(settings), headers={"X-Requested-With":"ApplyTrack"}) as c:
        result=c.post("/api/auth/register",json={"username":"TestUser","password":"Test-only-password-123!"})
        assert result.status_code==201
        yield c

@pytest.fixture
def payload():
    return dict(company='Synthetic Labs', role='Engineer', category='Engineering', channel='Referral', status='Applied', applied_at='2026-01-01', decision_at=None)
