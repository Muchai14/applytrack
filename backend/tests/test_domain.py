from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from app.domain import ApplicationInput, metrics, preview_import

def row(**extra):
    return dict(id='one', company='Demo', role='Analyst', category='Data', channel='Referral', status='Applied', applied_at='2026-01-01', status_changed_at='2026-01-01', last_followed_up_at=None, decision_at=None, updated_at='2026-01-01', **extra)

def test_empty_metrics():
    m = metrics([])
    assert m['total'] == 0 and m['median_days'] is None

def test_stale_exact_boundary():
    now = datetime(2026, 1, 22, tzinfo=timezone.utc)
    assert len(metrics([row()], now)['stale']) == 1
    assert not metrics([row()], now.replace(day=21, hour=23, minute=59))['stale']

def test_follow_up_and_terminal_excluded():
    a = row(); a['last_followed_up_at'] = '2026-01-25'
    b = row(); b['status'] = 'Closed'
    assert not metrics([a, b], datetime(2026, 1, 26, tzinfo=timezone.utc))['stale']

def test_median_and_category_denominator():
    rows = [row() for _ in range(3)]
    rows[0].update(status='Rejected', decision_at='2026-01-03')
    rows[1].update(status='Rejected', decision_at='2026-01-08')
    m = metrics(rows)
    assert m['median_days'] == 4.5
    assert m['categories'][0]['rate'] == 2/3

@pytest.mark.parametrize('changes', [dict(company=' '), dict(status='Unknown'), dict(applied_at='2026-02-30'), dict(applied_at='2099-01-01'), dict(status='Rejected'), dict(status='Rejected', decision_at='2025-12-31')])
def test_server_validation(changes, payload):
    with pytest.raises(ValidationError):
        ApplicationInput.model_validate({**payload, **changes})

def test_non_rejected_clears_decision(payload):
    assert ApplicationInput.model_validate({**payload, 'decision_at':'2026-01-03'}).decision_at is None

def test_csv_invalid_limits_and_headers():
    assert preview_import('x\nvalue', [])['errors']
    assert preview_import('x'*(1024*1024+1), [])['errors']


def test_csv_quoted_values_and_row_errors():
    header = 'source_id,company,role,category,channel,status,applied_at\n'
    result = preview_import(header+'one,"Example, Inc.",Analyst,Data,Referral,Applied,2026-01-01', [])
    assert not result['errors'] and result['rows'][0]['company'] == 'Example, Inc.'
    bad = preview_import(header+'one,,Analyst,Data,Referral,Applied,2026-01-01', [])
    assert bad['errors'][0].startswith('Row 2:')
