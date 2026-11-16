import logging
from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from app.main import create_app
from app import telemetry


def test_crud_and_restart_persistence(client, settings, payload):
    r = client.post('/api/applications', json=payload)
    assert r.status_code == 201
    a = r.json()
    changed = client.patch('/api/applications/'+a['id'], json={**payload, 'company':'Updated Demo'}).json()
    assert changed['status_changed_at'] == a['status_changed_at']
    with TestClient(create_app(settings),headers={"X-Requested-With":"ApplyTrack"}) as restarted:
        assert restarted.post("/api/auth/login",json={"username":"testuser","password":"Test-only-password-123!"}).status_code==200
        assert restarted.get('/api/applications').json()[0]['company'] == 'Updated Demo'
    assert client.delete('/api/applications/'+a['id']).status_code == 204
    assert client.get('/api/applications').json() == []


def test_status_transition_and_follow_up(client, payload):
    a = client.post('/api/applications', json=payload).json()
    assert client.get('/api/dashboard').json()['stale']
    assert client.post('/api/applications/'+a['id']+'/follow-ups').status_code == 204
    assert not client.get('/api/dashboard').json()['stale']
    assert client.patch('/api/applications/'+a['id'], json={**payload, 'status':'Rejected'}).status_code == 422
    rejected = client.patch('/api/applications/'+a['id'], json={**payload, 'status':'Rejected', 'decision_at':'2026-01-05'}).json()
    assert rejected['status'] == 'Rejected'
    assert client.get('/api/dashboard').json()['median_days'] == 4
    assert client.post('/api/applications/'+a['id']+'/follow-ups').status_code == 422
    assert client.patch('/api/applications/'+a['id'], json=payload).json()['decision_at'] is None


def test_invalid_input_is_sanitized_and_unknown_id(client, payload):
    secret = 'private-secret-must-not-appear'
    r = client.post('/api/applications', json={**payload,'applied_at':secret})
    assert r.status_code == 422 and secret not in r.text
    assert client.delete('/api/applications/missing').status_code == 404
    assert client.get('/api/incidents').json() == []

CSV = 'source_id,company,role,category,channel,status,applied_at\none,CSV Demo,Analyst,Data,Referral,Applied,2026-01-01'

def test_import_atomic_idempotent_and_conflicts(client):
    assert client.post('/api/imports/preview', json={'csv':CSV}).json()['created'] == 1
    assert client.get('/api/applications').json() == []
    assert client.post('/api/imports', json={'csv':CSV}).json()['created'] == 1
    assert client.post('/api/imports', json={'csv':CSV}).json()['skipped'] == 1
    assert client.post('/api/imports', json={'csv':CSV.replace('CSV Demo','Changed')}).json()['conflicts'] == 1
    invalid = CSV.replace('one,','two,')+'\nthree,,Analyst,Data,Referral,Applied,2026-01-01'
    assert client.post('/api/imports', json={'csv':invalid}).status_code == 422
    assert len(client.get('/api/applications').json()) == 1
    assert client.get('/api/applications').json()[0]['company'] == 'CSV Demo'


def test_concurrent_imports_do_not_duplicate(client):
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post('/api/imports',json={'csv':CSV}), range(2)))
    assert all(r.status_code == 200 for r in results)
    assert len(client.get('/api/applications').json()) == 1


def test_fault_authorization_and_production_disabled(client, settings):
    assert client.post('/ops/fault',json={'enabled':True}).status_code == 401
    headers = {'Authorization':'Bearer '+settings.ops_token}
    assert client.post('/ops/fault',headers=headers,json={'enabled':True}).status_code == 200
    assert client.get('/api/dashboard').status_code == 503
    assert client.get('/health').status_code == 200
    assert client.post('/ops/fault',headers=headers,json={'enabled':False}).status_code == 200
    assert client.get('/api/dashboard').status_code == 200
    with TestClient(create_app(replace(settings, environment='production', fault_enabled=False))) as prod:
        assert prod.post('/ops/fault',headers=headers,json={'enabled':True}).status_code == 404


def test_trace_metrics_logs_correlate_without_records(client, payload):
    events = []
    class Capture(logging.Handler):
        def emit(self, record): events.append(record.getMessage())
    handler = Capture(); telemetry.logger.addHandler(handler)
    try:
        client.post('/api/applications',json={**payload,'company':'PrivateCompany-DoNotLog'})
        response = client.get('/api/dashboard')
        tid = response.headers['x-trace-id']
        assert len(tid) == 32 and tid != '0'*32
        assert any(tid in e and '/api/dashboard' in e for e in events)
        assert all('PrivateCompany-DoNotLog' not in e and settings_token_not_used() not in e for e in events)
        metrics = client.get('/metrics',headers={'Accept':'application/openmetrics-text'}).text
        assert 'applytrack_http_requests_total' in metrics and tid in metrics
    finally:
        telemetry.logger.removeHandler(handler)

def settings_token_not_used():
    return 'test-ops-token-at-least-24-characters'


def test_render_dev_production_schema_isolation(settings, monkeypatch, payload):
    import os
    import subprocess
    import sys
    import uuid
    from sqlalchemy import text
    from app.db import connect
    schemas=['test_dev_'+uuid.uuid4().hex[:8], 'test_prod_'+uuid.uuid4().hex[:8]]
    try:
        for index, schema in enumerate(schemas):
            monkeypatch.setenv('DB_SCHEMA',schema)
            env={**os.environ,'DATABASE_URL':settings.database_url,'DB_SCHEMA':schema}
            subprocess.run([sys.executable,'-m','alembic','upgrade','head'],env=env,check=True,capture_output=True)
            with TestClient(create_app(settings),headers={"X-Requested-With":"ApplyTrack"}) as app:
                assert app.post("/api/auth/register",json={"username":"SchemaUser","password":"Test-only-password-123!"}).status_code==201
                assert app.get('/api/applications').json()==[]
                if index==0: assert app.post('/api/applications',json=payload).status_code==201
        monkeypatch.setenv('DB_SCHEMA',schemas[0])
        with TestClient(create_app(settings),headers={"X-Requested-With":"ApplyTrack"}) as app:
            assert app.post("/api/auth/login",json={"username":"SchemaUser","password":"Test-only-password-123!"}).status_code==200
            assert len(app.get('/api/applications').json())==1
    finally:
        monkeypatch.delenv('DB_SCHEMA',raising=False)
        engine,_=connect(settings)
        with engine.begin() as db:
            for schema in schemas: db.execute(text('DROP SCHEMA IF EXISTS '+schema+' CASCADE'))
        engine.dispose()
