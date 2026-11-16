from dataclasses import replace
import pytest
from sqlalchemy import select
from app.db import Incident, State
from app.runtime import Checker, DiagnosticTools, plan, valid_dashboard
from app.config import Settings


def test_fault_alert_repairs_and_verifies(client, settings, sessions):
    headers = {'Authorization':'Bearer '+settings.ops_token}
    client.post('/ops/fault',headers=headers,json={'enabled':True})
    checker = Checker(settings,sessions,DiagnosticTools(client,settings.ops_token),verification_delay=0)
    assert checker.cycle() is False
    with sessions() as db: assert not list(db.scalars(select(Incident)))
    assert checker.cycle() is False
    assert client.get('/api/dashboard').status_code == 200
    with sessions() as db:
        incident = db.scalar(select(Incident))
        assert incident.status == 'Resolved' and incident.attempted
        assert 'Two consecutive' in incident.verification
        assert 'flag' in incident.action
    checker.cycle()
    with sessions() as db: assert len(list(db.scalars(select(Incident)))) == 1


class BrokenTools:
    def __init__(self, known=False, repair=False):
        self.known, self.repair, self.executions = known, repair, 0
    def check(self): return False, 'dashboard_unreachable', ''
    def diagnose(self): return {'environment':'test','dashboard_fault':self.known,'release_id':'test'}
    def execute(self, action, environment):
        self.executions += 1
        return self.repair


def test_unknown_failure_escalates_without_repair(settings, sessions):
    tools = BrokenTools()
    checker = Checker(settings,sessions,tools,verification_delay=0)
    for _ in range(4): checker.cycle()
    with sessions() as db:
        records = list(db.scalars(select(Incident)))
        assert len(records) == 1 and records[0].status == 'Needs attention'
    assert tools.executions == 0


def test_failed_repair_never_retries_and_restart_keeps_state(settings,sessions):
    tools = BrokenTools(known=True)
    Checker(settings,sessions,tools,verification_delay=0).cycle()
    checker = Checker(settings,sessions,tools,verification_delay=0)
    checker.cycle(); checker.cycle()
    assert tools.executions == 1
    with sessions() as db: assert db.scalar(select(Incident)).status == 'Needs attention'


def test_failed_verification_escalates(settings,sessions):
    tools = BrokenTools(known=True,repair=True)
    checker=Checker(settings,sessions,tools,verification_delay=0)
    checker.cycle(); checker.cycle()
    with sessions() as db:
        incident=db.scalar(select(Incident))
        assert incident.status=='Needs attention' and 'verification failed' in incident.verification


def test_policy_and_tools_reject_unauthorized_actions():
    assert plan({'environment':'dev','dashboard_fault':True},'production')=='escalate'
    assert plan({'environment':'production','dashboard_fault':True},'dev')=='escalate'
    tools=DiagnosticTools(None,'not-used')
    with pytest.raises(PermissionError): tools.execute('execute_shell','dev')
    with pytest.raises(PermissionError): tools.execute('disable_dev_fault','production')
    with pytest.raises(ValueError): Settings(environment='production',fault_enabled=True)
    assert not valid_dashboard({'total':0})
