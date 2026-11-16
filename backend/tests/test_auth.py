from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import logging
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.auth import COOKIE, hash_password, verify_password
from app.db import Application, LoginSession, User
from app.main import create_app
from app import telemetry

PASSWORD='Disposable-test-password-123!'
HEADER={'X-Requested-With':'ApplyTrack'}
def account(settings, name):
    c=TestClient(create_app(settings),headers=HEADER)
    assert c.post('/api/auth/register',json={'username':name,'password':PASSWORD}).status_code==201
    return c


def test_register_login_logout_and_cookie_properties(settings,sessions):
    with TestClient(create_app(settings),headers=HEADER) as c:
        assert c.get('/api/auth/me').json()=={'user':None}
        assert c.get('/api/dashboard').status_code==401
        r=c.post('/api/auth/register',json={'username':'Alice','password':PASSWORD})
        assert r.status_code==201 and r.json()['user']['username']=='Alice'
        cookie=r.headers['set-cookie'].lower()
        assert 'httponly' in cookie and 'samesite=lax' in cookie and 'max-age=604800' in cookie
        token=c.cookies.get(COOKIE)
        with sessions() as db:
            u=db.scalar(select(User))
            assert u.password_hash!=PASSWORD and PASSWORD not in u.password_hash
            assert db.get(LoginSession,hashlib.sha256(token.encode()).hexdigest())
            assert not db.get(LoginSession,token)
        assert c.get('/api/auth/me').json()['user']['username']=='Alice'
        assert c.post('/api/auth/logout').status_code==204
        assert c.get('/api/applications').status_code==401
        assert c.get('/api/auth/me',headers={'Cookie':COOKIE+'='+token}).json()['user'] is None
        assert c.post('/api/auth/login',json={'username':'ALICE','password':PASSWORD}).status_code==200
        assert c.cookies.get(COOKIE)!=token


def test_duplicate_names_password_policy_and_invalid_login(settings,sessions):
    with account(settings,'Alice') as c:
        assert c.post('/api/auth/register',json={'username':'aLiCe','password':PASSWORD}).status_code==409
        assert c.post('/api/auth/register',json={'username':'bad name','password':PASSWORD}).status_code==422
        assert c.post('/api/auth/register',json={'username':'Bobby','password':'short'}).status_code==422
        c.post('/api/auth/logout')
        a=c.post('/api/auth/login',json={'username':'Alice','password':'wrong'})
        b=c.post('/api/auth/login',json={'username':'Unknown','password':'wrong'})
        assert a.status_code==b.status_code==401 and a.json()==b.json()


def test_session_expiry_and_rotation(settings,sessions):
    with account(settings,'Alice') as c:
        old=c.cookies.get(COOKIE)
        assert c.post('/api/auth/login',json={'username':'Alice','password':PASSWORD}).status_code==200
        with sessions() as db:
            assert db.get(LoginSession,hashlib.sha256(old.encode()).hexdigest()) is None
            saved=db.get(LoginSession,hashlib.sha256(c.cookies.get(COOKIE).encode()).hexdigest())
            saved.expires_at=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat();db.commit()
        assert c.get('/api/auth/me').json()['user'] is None
        assert c.get('/api/applications').status_code==401


def test_ownership_all_paths_and_per_user_source_ids(settings,sessions,payload):
    alice=account(settings,'Alice');bob=account(settings,'Bobby')
    try:
        a=alice.post('/api/applications',json=payload).json()
        assert 'owner_id' not in a
        assert bob.get('/api/applications').json()==[]
        assert bob.get('/api/dashboard').json()['total']==0
        for method, suffix, body in [('patch','',payload),('delete','',None),('post','/follow-ups',None)]:
            result=getattr(bob,method)('/api/applications/'+a['id']+suffix,**({'json':body} if body else {}))
            assert result.status_code==404
        csv='source_id,company,role,category,channel,status,applied_at\nshared,CSV Demo,Engineer,Engineering,Other,Applied,2026-01-01'
        assert alice.post('/api/imports',json={'csv':csv}).json()['created']==1
        assert bob.post('/api/imports/preview',json={'csv':csv}).json()['created']==1
        assert bob.post('/api/imports',json={'csv':csv}).json()['created']==1
        assert alice.get('/api/dashboard').json()['total']==2
        assert bob.get('/api/dashboard').json()['total']==1
        # A caller cannot choose or change ownership in JSON.
        assert bob.patch('/api/applications/'+a['id'],json={**payload,'owner_id':a['id']}).status_code in (404,422)
    finally: alice.close();bob.close()


def test_legacy_rows_not_claimed_and_monitor_never_reads_owned_records(settings,sessions,payload):
    from app.db import utcnow
    with sessions() as db:
        db.add(Application(id='legacy',owner_id=None,**payload,created_at=utcnow(),updated_at=utcnow(),status_changed_at=payload['applied_at']));db.commit()
    with account(settings,'Alice') as c:
        assert c.get('/api/applications').json()==[]
        assert c.get('/api/dashboard').json()['total']==0
        c.post('/api/applications',json=payload)
        monitor=c.get('/api/dashboard',headers={'Authorization':'Bearer '+settings.ops_token})
        assert monitor.json()['total']==1 and monitor.json()['recent'][0]['id']=='legacy'
        c.post('/api/auth/logout')
        assert c.post('/api/applications',headers={'Authorization':'Bearer '+settings.ops_token},json=payload).status_code==401


def test_csrf_and_secure_cookie(settings,sessions,payload):
    with TestClient(create_app(settings)) as no_header:
        assert no_header.post('/api/auth/register',json={'username':'Alice','password':PASSWORD}).status_code==403
    with account(settings,'Alice') as c:
        assert c.post('/api/applications',headers={'Origin':'https://evil.example'},json=payload).status_code==403
        assert c.post('/api/auth/logout',headers={'Sec-Fetch-Site':'cross-site'}).status_code==403
        assert c.post('/api/applications',headers={'Origin':'http://testserver'},json=payload).status_code==201
    prod=replace(settings,environment='production',fault_enabled=False,public_origin='https://testserver')
    with TestClient(create_app(prod),base_url='https://testserver',headers=HEADER) as c:
        r=c.post('/api/auth/login',json={'username':'Alice','password':PASSWORD})
        assert r.status_code==200 and 'secure' in r.headers['set-cookie'].lower()


def test_throttle_and_no_credentials_in_telemetry(settings,sessions):
    from app.auth import throttle
    from starlette.requests import Request
    from fastapi import HTTPException
    request=Request({'type':'http','client':('rate-test',123),'headers':[]})
    with sessions() as db:
        for _ in range(8):throttle(db,request,'register')
        with pytest.raises(HTTPException) as err:throttle(db,request,'register')
        assert err.value.status_code==429
    events=[]
    class Capture(logging.Handler):
        def emit(self,record):events.append(record.getMessage())
    capture=Capture();telemetry.logger.addHandler(capture)
    try:
        with account(settings,'HiddenUsername') as c:
            c.get('/api/auth/me');c.post('/api/auth/logout')
        assert events and all(PASSWORD not in line and 'HiddenUsername' not in line and COOKIE not in line for line in events)
    finally:telemetry.logger.removeHandler(capture)


def test_salted_hashes():
    first=hash_password(PASSWORD);second=hash_password(PASSWORD)
    assert first!=second
    assert verify_password(PASSWORD,first) and not verify_password('incorrect',first)
    assert not verify_password(PASSWORD,'malformed')
