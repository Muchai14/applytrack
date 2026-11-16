"""Independent checker and policy-based responder. No paid model is required."""
import argparse
import asyncio
import hmac
import os
import time
import uuid
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from prometheus_client import CollectorRegistry, Gauge, generate_latest
from sqlalchemy import select, text, update
from .config import Settings
from .db import Incident, State, connect, utcnow
from .domain import STATUSES
from .telemetry import configure, log_event


def valid_dashboard(v):
    if not isinstance(v, dict) or any(type(v.get(k)) is not int or v[k] < 0 for k in ('total', 'open', 'interviews', 'rejected')):
        return False
    counts = v.get('counts', {})
    if not isinstance(counts, dict) or any(type(counts.get(k)) is not int or counts[k] < 0 for k in STATUSES):
        return False
    return (sum(counts.values()) == v['total'] and counts['Applied']+counts['Interview'] == v['open']
            and all(isinstance(v.get(k), list) for k in ('stale', 'recent', 'categories'))
            and (v.get('median_days') is None or type(v['median_days']) in (int, float)))


class DiagnosticTools:
    """Fixed same-origin tools; never accepts arbitrary URLs, SQL or shell."""
    def __init__(self, client, token):
        self.client = client
        self.headers = {'Authorization': 'Bearer '+token}

    def check(self):
        try:
            r = self.client.get('/api/dashboard', timeout=5)
            tid = r.headers.get('x-trace-id', '')
            tid = tid if len(tid) == 32 and all(c in '0123456789abcdef' for c in tid) else ''
            if r.status_code != 200:
                return False, 'dashboard_http_error', tid
            return (True, 'ok', tid) if valid_dashboard(r.json()) else (False, 'invalid_dashboard_response', tid)
        except (httpx.HTTPError, ValueError):
            return False, 'dashboard_unreachable', ''

    def diagnose(self):
        r = self.client.get('/ops/diagnostics', headers=self.headers, timeout=5)
        if r.status_code != 200:
            return None
        d = r.json()
        return {'environment': d.get('environment'), 'dashboard_fault': d.get('dashboard_fault') is True,
                'release_id': str(d.get('release_id', 'unknown'))[:100]}

    def execute(self, action, environment):
        if action != 'disable_dev_fault' or environment not in ('dev', 'test'):
            raise PermissionError('Remediation action is not allowlisted')
        r = self.client.post('/ops/fault', headers=self.headers, json={'enabled': False}, timeout=5)
        r.raise_for_status()
        return r.json().get('enabled') is False


def plan(diagnostics, environment):
    if environment in ('dev', 'test') and diagnostics and diagnostics.get('environment') == environment and diagnostics.get('dashboard_fault') is True:
        return 'disable_dev_fault'
    return 'escalate'


class Checker:
    def __init__(self, settings, sessions, tools, verification_delay=1):
        self.settings, self.sessions, self.tools = settings, sessions, tools
        self.verification_delay = verification_delay

    def cycle(self, force_alert=False):
        healthy, category, trace_id = self.tools.check()
        key = 'checker:'+self.settings.environment
        with self.sessions() as db:
            if db.bind.dialect.name == 'postgresql':
                db.execute(text('SELECT pg_advisory_xact_lock(6420092)'))
            state = db.get(State, key)
            if state is None:
                state = State(key=key, value={'failures': 0, 'successes': 0})
                db.add(state)
            failures = 0 if healthy else state.value.get('failures', 0)+1
            successes = state.value.get('successes', 0)+1 if healthy else 0
            state.value = {'failures': failures, 'successes': successes, 'last_check': utcnow(), 'healthy': healthy}
            incident = db.scalar(select(Incident).where(Incident.active_key == key))
            if healthy and incident and successes >= 2:
                incident.status, incident.active_key, incident.resolved_at = 'Resolved', None, utcnow()
                incident.verification = 'Two consecutive external dashboard checks returned valid HTTP 200 responses.'
            if not healthy and (failures >= 2 or force_alert) and incident is None:
                incident = Incident(id='INC-'+uuid.uuid4().hex[:12], active_key=key, environment=self.settings.environment,
                    route='/api/dashboard', detected_at=utcnow(), status='Investigating', diagnosis=category,
                    action='No remediation attempted.', verification='Recovery not verified.', release_id=self.settings.release_id, trace_id=trace_id, attempted=False)
                db.add(incident)
            db.commit()
            incident_id = incident.id if incident and incident.active_key else None
        log_event('availability_check', healthy=healthy, error_category=category, environment=self.settings.environment)
        if incident_id:
            self.respond(incident_id)
        return healthy

    def respond(self, incident_id):
        with self.sessions() as db:
            claim = db.execute(update(Incident).where(Incident.id == incident_id, Incident.attempted.is_(False), Incident.active_key.is_not(None)).values(attempted=True))
            db.commit()
            if claim.rowcount != 1:
                return
        diagnosis = 'Unknown failure; human investigation required.'
        action = 'No automatic action authorized. Escalated for human investigation.'
        verification, resolved, release = 'Recovery not verified.', False, 'unknown'
        try:
            diagnostics = self.tools.diagnose()
            decision = plan(diagnostics, self.settings.environment)
            if diagnostics:
                release = diagnostics['release_id']
            if decision == 'disable_dev_fault':
                diagnosis = 'Authenticated diagnostics confirmed the dev dashboard fault flag was enabled.'
                if not self.tools.execute(decision, self.settings.environment):
                    raise RuntimeError('Repair was not acknowledged')
                action = 'Responder disabled the allowlisted dev fault flag. No application records changed.'
                outcomes = []
                for _ in range(2):
                    if self.verification_delay:
                        time.sleep(self.verification_delay)
                    outcomes.append(self.tools.check()[0])
                resolved = all(outcomes)
                verification = 'Two consecutive external dashboard checks returned valid HTTP 200 responses.' if resolved else 'Repair attempted but verification failed. Escalated to human.'
        except Exception:
            action = 'Diagnostic or remediation tool failed. Escalated to human; no retry authorized.'
        with self.sessions() as db:
            incident = db.get(Incident, incident_id)
            incident.diagnosis, incident.action, incident.verification = diagnosis, action, verification
            incident.release_id = release
            incident.status = 'Resolved' if resolved else 'Needs attention'
            if resolved:
                incident.resolved_at, incident.active_key = utcnow(), None
            db.commit()
        log_event('incident_response', incident_id=incident_id, resolved=resolved, environment=self.settings.environment)


def build_runtime(settings=None, client=None):
    settings = settings or Settings()
    engine, sessions = connect(settings)
    configure()
    client = client or httpx.Client(base_url=os.getenv('API_URL', 'http://api:8000'))
    checker = Checker(settings, sessions, DiagnosticTools(client, settings.ops_token))
    registry = CollectorRegistry()
    availability = Gauge('applytrack_dashboard_available', 'Latest external dashboard check', registry=registry)
    async def loop():
        while True:
            try:
                availability.set(await asyncio.to_thread(checker.cycle))
            except Exception:
                availability.set(0)
                log_event('checker_error', error_category='checker_or_database_unavailable')
            await asyncio.sleep(max(1, int(os.getenv('CHECK_INTERVAL_SECONDS', '30'))))
    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(loop())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        client.close()
        engine.dispose()
    app = FastAPI(title='ApplyTrack independent checker', lifespan=lifespan)
    @app.get('/health')
    def health():
        return {'status': 'ok'}
    @app.get('/metrics')
    def metrics():
        return Response(generate_latest(registry), media_type='text/plain; version=0.0.4')
    @app.post('/alerts')
    async def alert(request: Request):
        if not settings.ops_token or not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer '+settings.ops_token):
            raise HTTPException(401, 'Alert authorization required')
        # Ignore untrusted alert annotations; recheck live impact before acting.
        healthy = await asyncio.to_thread(checker.cycle, True)
        return {'checked': True, 'currently_healthy': healthy}
    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    if args.once:
        settings = Settings()
        engine, sessions = connect(settings)
        with httpx.Client(base_url=os.environ['API_URL']) as client:
            Checker(settings, sessions, DiagnosticTools(client, settings.ops_token)).cycle()
        engine.dispose()
    else:
        import uvicorn
        uvicorn.run(build_runtime(), host='0.0.0.0', port=9000, access_log=False)
if __name__ == '__main__':
    main()
