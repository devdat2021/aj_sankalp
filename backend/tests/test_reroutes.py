from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import connection


def auth(role):
    return {'Authorization': f'Bearer local-{role}-demo'}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(connection, 'path', tmp_path / 'state.json')
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection.settings, 'demo_mode', True)
    return TestClient(app)


def propose(client):
    options = [dict(id='ALT-1', name='Inland diversion', delay_hours=1, cost=300, risk=15,
                    points=[[13, 74], [13.2, 74.2]], distance=20000, duration=3600, source='Operator estimate'),
               dict(id='ALT-2', name='Longer diversion', delay_hours=2, cost=200, risk=10)]
    response = client.post('/api/route-requests', headers=auth('driver'),
                           json=dict(shipment_id='SHP-101', reason='Road blocked by flooding', options=options))
    assert response.status_code == 201, response.text
    return response.json()


def decide(client, rid, status='approved', option='ALT-1', role='logistics'):
    return client.patch('/api/route-requests/' + rid, headers=auth(role),
                        json=dict(status=status, option_id=option, reason='Reviewed road conditions'))


def state_copy():
    with connection.transaction() as state:
        return deepcopy(state)


def test_approval_updates_driver_once_and_records_distinct_history(client):
    before = client.get('/api/shipments/SHP-101', headers=auth('driver')).json()
    request = propose(client)
    pending = client.get('/api/shipments/SHP-101', headers=auth('driver')).json()
    assert pending.get('route') == before.get('route')
    assert pending['eta_hours'] == before['eta_hours']
    result = decide(client, request['id'])
    assert result.status_code == 200
    assert result.json()['reason'] == request['reason']
    assert result.json()['decision_reason'] == 'Reviewed road conditions'
    dashboard = client.get('/api/driver/dashboard', headers=auth('driver')).json()
    cargo = next(s for s in dashboard['shipments'] if s['id'] == 'SHP-101')
    assert cargo['route']['points'] == [[13, 74], [13.2, 74.2]]
    assert cargo['eta_hours'] == before['eta_hours'] + 1
    history = [e for e in cargo['history'] if e['id'].startswith(request['id'])]
    assert [e['event'] for e in history] == ['route_pending', 'route_approved']
    assert history[0]['created_at'] == request['created_at']
    assert history[1]['created_at'] == result.json()['reviewed_at']
    assert history[1]['actor'] == 'logistics-demo'
    assert any('reroute approved' in a['message'] for a in dashboard['alerts'])
    saved = state_copy()
    assert decide(client, request['id']).status_code == 409
    assert state_copy() == saved
    # Reading derived histories must not save them back onto the consignment.
    client.get('/api/shipments/SHP-101', headers=auth('logistics'))
    assert state_copy() == saved


def test_rejection_preserves_route_eta_and_allows_new_proposal(client):
    before = state_copy()['shipments'][0]
    request = propose(client)
    response = decide(client, request['id'], status='rejected', option=None)
    assert response.status_code == 200
    after = state_copy()['shipments'][0]
    assert after == before
    assert response.json()['reason'] == request['reason']
    assert response.json()['option_id'] is None
    assert propose(client)['status'] == 'pending'


@pytest.mark.parametrize('role', ['port', 'captain', 'driver'])
def test_only_logistics_decides(client, role):
    request = propose(client)
    before = state_copy()
    assert decide(client, request['id'], role=role).status_code == 403
    assert state_copy() == before


def test_invalid_option_and_duplicate_submission_do_not_mutate(client):
    request = propose(client)
    before = state_copy()
    assert decide(client, request['id'], option='UNKNOWN').status_code == 422
    assert state_copy() == before
    assert client.post('/api/route-requests', headers=auth('driver'), json=dict(
        shipment_id='SHP-101', reason='Second proposal', options=request['options'])).status_code == 409
    assert state_copy() == before
    assert client.patch('/api/route-requests/' + request['id'], headers=auth('logistics'),
                        json=dict(status='rejected', reason='   ')).status_code == 422


@pytest.mark.parametrize('truck_id', ['TRK-101', 'TRK-102'])
def test_reassignment_or_route_edit_supersedes_pending_request(client, truck_id):
    request = propose(client)
    response = client.put('/api/shipments/SHP-101/assignment', headers=auth('logistics'),
                          json=dict(truck_id=truck_id, route=dict(id='NEW', name='Updated initial route', delay_hours=0)))
    assert response.status_code == 200, response.text
    row = next(r for r in client.get('/api/route-requests', headers=auth('logistics')).json() if r['id'] == request['id'])
    assert row['status'] == 'superseded'
    before = state_copy()
    assert decide(client, request['id']).status_code == 409
    assert state_copy() == before
    assert client.post('/api/route-requests', headers=auth('logistics'), json=dict(
        shipment_id='SHP-101', reason='Fresh proposal', options=request['options'])).status_code == 201


def test_out_of_band_route_change_cannot_approve_stale_proposal(client):
    request = propose(client)
    with connection.transaction() as state:
        state['shipments'][0]['route_id'] = 'EXTERNAL-EDIT'
    before = state_copy()
    assert decide(client, request['id']).status_code == 409
    assert state_copy() == before
    dashboard = client.get('/api/driver/dashboard', headers=auth('driver')).json()
    assert next(r for r in dashboard['requests'] if r['id'] == request['id'])['status'] == 'superseded'
    assert propose(client)['status'] == 'pending'


def test_delivered_cargo_cannot_receive_pending_route_decision(client):
    request = propose(client)
    with connection.transaction() as state:
        state['shipments'][0]['status'] = 'in_transit'
    assert client.post('/api/shipments/SHP-101/events', headers=auth('driver'), json=dict(event='delivered')).status_code == 200
    assert decide(client, request['id']).status_code == 409
    assert client.post('/api/route-requests', headers=auth('driver'), json=dict(
        shipment_id='SHP-101', reason='Too late', options=request['options'])).status_code == 409


def test_eligibility_ready_state_and_matching_access(client):
    with connection.transaction() as state:
        state['shipments'][0]['status'] = 'ready_for_pickup'
        state['port_requests'].append(dict(id='ACCESS', shipment_id='SHP-101', kind='truck_access', status='approved', truck_id='TRK-101'))
    for role in ['logistics', 'driver', 'port']:
        response = client.get('/api/shipments/SHP-101/eligibility', headers=auth(role))
        assert response.status_code == 200
        assert response.json()['pickup_allowed'] and response.json()['unloaded']
        assert response.json()['blocked_reason'] is None
    with connection.transaction() as state:
        state['port_requests'][0]['truck_id'] = 'TRK-102'
    assert not client.get('/api/shipments/SHP-101/eligibility', headers=auth('driver')).json()['pickup_allowed']
    assert client.post('/api/shipments/SHP-101/events', headers=auth('driver'), json=dict(event='picked_up')).status_code == 409
