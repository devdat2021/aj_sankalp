from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app.database import connection
from app.main import app
from app.services import work_access

LOGISTICS = {'Authorization': 'Bearer local-logistics-demo'}
SHIP = '/api/shipments/SHP-101'
DASH = '/api/driver/dashboard'
EXCHANGE = '/api/driver/work/exchange'
ROUTE = dict(id='coast', name='Approved coast road', delay_hours=0,
             points=[[12.9, 74.8], [13.3, 74.7]])


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(connection, 'path', tmp_path / 'state.json')
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection.settings, 'demo_mode', True)
    monkeypatch.setattr(work_access, '_windows', work_access.OrderedDict())
    with connection.transaction() as s:
        same_truck = deepcopy(s['shipments'][0])
        same_truck['id'] = 'PRIVATE'
        s['shipments'].append(same_truck)
        driver = dict(s['users'][2], id='second-driver', active=True, role='driver',
                      company_id='LOG-101', asset_id='TRK-102')
        s['users'].append(driver)
        s['vehicles'][1]['driver_id'] = driver['id']
    return TestClient(app)


def assign(client, truck='TRK-101'):
    issued = client.put(SHIP + '/assignment', headers=LOGISTICS, json=dict(truck_id=truck, route=ROUTE))
    assert issued.status_code == 200, issued.text
    return issued.json()['work_token']


def exchange(client, token):
    return client.post(EXCHANGE, json={'token': token})


def verify_scan(client, token):
    response = exchange(client, token)
    assert response.status_code == 200, response.text
    session = response.json()['token']
    assert token not in connection.path.read_text() and session not in connection.path.read_text()
    return {'Authorization': 'Bearer ' + session}


def test_assignment_workflow(client):
    headers = verify_scan(client, assign(client))
    dashboard = client.get(DASH, headers=headers)
    assert dashboard.status_code == 200
    assert 'PRIVATE' not in dashboard.text and 'SHP-102' not in dashboard.text
    sh, = dashboard.json()['shipments']
    assert sh['route']['points'] == ROUTE['points']
    assert client.get('/api/me', headers=headers).status_code == 401
    assert client.get('/api/logistics/dashboard', headers=headers).status_code == 403
    proposal = dict(shipment_id='PRIVATE', reason='Road closure', options=[ROUTE])
    assert client.post('/api/route-requests', headers=headers, json=proposal).status_code == 404
    proposal['shipment_id'] = sh['id']
    assert client.post('/api/route-requests', headers=headers, json=proposal).status_code == 201
    incident = dict(shipment_id=sh['id'], category='delay', description='Traffic delay', lat=13, lng=75, severity='low')
    assert client.post('/api/incidents', headers=headers, json=incident).status_code == 201
    with connection.transaction() as s:
        s['shipments'][0]['status'] = 'ready_for_pickup'
        s['port_requests'].append(dict(id='slot', shipment_id=sh['id'], truck_id='TRK-101', kind='truck_access', status='approved'))
    for event in ('picked_up','delivered'):
        assert client.post(SHIP + '/events', headers=headers, json={'event':event}).status_code == 200
    assert client.get(DASH, headers=headers).status_code == 401


@pytest.mark.parametrize('cause', ['revoke','reassign','expire','cancel','driver_change'])
def test_open_sessions_lose_access(client, cause):
    token = assign(client)
    headers = verify_scan(client, token)
    if cause == 'revoke':
        assert client.post(SHIP + '/driver-access?action=revoke', headers=LOGISTICS).is_success
    elif cause == 'reassign':
        new = verify_scan(client, assign(client, 'TRK-102'))
        assert client.get(DASH, headers=new).json()['shipments'][0]['truck_id'] == 'TRK-102'
        assign(client)
    elif cause == 'expire':
        with connection.transaction() as s:
            s['work_access'][0]['expires'] = 0
    elif cause == 'cancel':
        with connection.transaction() as s:
            s['shipments'][0]['status'] = 'cancelled'
    else:
        with connection.transaction() as s:
            s['vehicles'][0]['driver_id'] = None
        with connection.transaction() as s:
            s['vehicles'][0]['driver_id'] = 'driver-demo'
    assert exchange(client, token).status_code == 401
    assert client.get(DASH, headers=headers).status_code == 401
    assert client.post(SHIP + '/events', headers=headers, json={'event':'picked_up'}).status_code == 401


def test_invalid_link_and_limits(client):
    for _ in range(30):
        assert exchange(client, 'x' * 43).status_code == 401
    assert exchange(client, 'x' * 43).status_code == 429
