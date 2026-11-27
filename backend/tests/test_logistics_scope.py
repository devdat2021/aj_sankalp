"""Company isolation through real API authentication, using temporary operational storage."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.main import app
from app.database import connection
from app.services.workflow import visible


def auth(role):
    return {'Authorization': f'Bearer local-{role}-demo'}


@pytest.fixture
def tenants(tmp_path, monkeypatch):
    monkeypatch.setattr(connection, 'path', tmp_path / 'state.json')
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection.settings, 'demo_mode', True)
    monkeypatch.setattr(connection.settings, 'supabase_url', 'https://auth.example.test')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(jwt, 'PyJWKClient', lambda url: SimpleNamespace(
        get_signing_key_from_jwt=lambda token: SimpleNamespace(key=key.public_key())))
    token = jwt.encode(dict(sub='company-b-subject', aud=connection.settings.supabase_jwt_audience,
                            iss='https://auth.example.test/auth/v1',
                            exp=datetime.now(timezone.utc) + timedelta(minutes=10),
                            company_id='LOG-101', role='port'), key, algorithm='RS256')
    # Even signed client/JWT role and company claims do not override the trusted mapping.
    with connection.transaction() as state:
        state['companies'].append(dict(id='LOG-B', name='Company B'))
        state['users'].append(dict(id='user-b', auth_user_id='company-b-subject',
                                   role='logistics', company_id='LOG-B', active=True, name='B'))
        state['users'].append(dict(id='driver-b', auth_user_id='driver-b-subject',
                                   role='driver', company_id='LOG-B', asset_id='TRK-B', active=True))
        state['vehicles'].append(dict(id='TRK-B', name='B truck', company_id='LOG-B',
                                      driver_id='driver-b', lat=12, lng=74, status='Available'))
        other = deepcopy(state['shipments'][0])
        other.update(id='SHP-B', company_id='LOG-B', truck_id='TRK-B', cargo='Private B cargo',
                     events=[dict(id='EVENT-B', event='departed', created_at='2026-01-01T00:00:00Z')])
        state['shipments'].append(other)
        state['incidents'].append(dict(id='INC-B', shipment_id='SHP-B', description='Private B incident'))
        state['requests'].append(dict(id='REQ-B', shipment_id='SHP-B', status='pending',
                                      reason='Private B route', options=[dict(id='OPT-B', name='B road', delay_hours=1)]))
        state['port_requests'].append(dict(id='PORT-B', shipment_id='SHP-B', kind='handling', status='pending'))
        state['vessels'][0]['manifest'] = ['SHP-101', 'SHP-B']
        state['vessels'][0]['events'] = [dict(shipment_id='SHP-B', cargo='Private B cargo')]
    return TestClient(app), {'Authorization': 'Bearer ' + token}


def test_company_dashboard_lists_and_nested_vessel_data(tenants):
    client, company_b = tenants
    for headers, expected, forbidden in [(auth('logistics'), {'SHP-101', 'SHP-102'}, 'SHP-B'),
                                         (company_b, {'SHP-B'}, 'SHP-101')]:
        response = client.get('/api/logistics/dashboard', headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert {s['id'] for s in data['shipments']} == expected
        assert forbidden not in response.text
        assert data['docking_requests'] == [] and 'audit' not in data
        assert all('manifest' not in v and 'events' not in v for v in data['vessels'])
        assert 'VES-101' in {v['id'] for v in data['vessels']}
        for endpoint in ['incidents', 'route-requests', 'port-requests']:
            rows = client.get('/api/' + endpoint, headers=headers)
            assert rows.status_code == 200
            assert all(r['shipment_id'] in expected for r in rows.json())
    assert {v['id'] for v in client.get('/api/logistics/dashboard', headers=company_b).json()['vehicles']} == {'TRK-B'}
    # Preserve legitimate captain manifest visibility and port operational access.
    for role in ['port', 'captain']:
        data = client.get(f'/api/{role}/dashboard', headers=auth(role)).json()
        assert {'SHP-101', 'SHP-B'} <= {s['id'] for s in data['shipments']}
    assert client.get('/api/shipments/SHP-101', headers=auth('driver')).status_code == 200
    assert client.get('/api/shipments/SHP-B', headers=auth('driver')).status_code == 404


def test_direct_lookup_is_symmetric_and_does_not_disclose_existence(tenants):
    client, company_b = tenants
    for headers, own, foreign in [(auth('logistics'), 'SHP-101', 'SHP-B'), (company_b, 'SHP-B', 'SHP-101')]:
        assert client.get('/api/shipments/' + own, headers=headers).status_code == 200
        denied = client.get('/api/shipments/' + foreign, headers=headers)
        missing = client.get('/api/shipments/guessed-id', headers=headers)
        assert denied.status_code == missing.status_code == 404
        assert denied.json() == missing.json()


@pytest.mark.parametrize('method,path,body', [
    ('PUT', '/shipments/SHP-B/assignment', dict(truck_id='TRK-101', route=dict(id='R', name='Route', delay_hours=0))),
    ('POST', '/incidents', dict(shipment_id='SHP-B', category='flood', severity='high', description='Flood reported', lat=12, lng=74)),
    ('POST', '/route-requests', dict(shipment_id='SHP-B', reason='New road', options=[dict(id='R', name='Route', delay_hours=0)])),
    ('PATCH', '/route-requests/REQ-B', dict(status='approved', option_id='OPT-B', reason='Approve route')),
    ('POST', '/port-requests', dict(shipment_id='SHP-B', kind='handling', requested_at='2026-12-01T00:00:00Z')),
])
def test_cross_company_writes_are_denied_without_mutation(tenants, method, path, body):
    client, _ = tenants
    with connection.transaction() as state:
        before = deepcopy(state)
    result = client.request(method, '/api' + path, headers=auth('logistics'), json=body)
    assert result.status_code == 404, result.text
    with connection.transaction() as state:
        assert state == before


def test_owned_writes_and_trusted_company_identity(tenants):
    client, company_b = tenants
    body = dict(cargo='B cargo', quantity=2, origin='Kochi', destination='Udupi', vessel_id='VES-101')
    assert client.post('/api/shipments', headers=company_b, json=body | {'company_id': 'LOG-101'}).status_code == 422
    result = client.post('/api/shipments', headers=company_b, json=body)
    assert result.status_code == 201
    row = result.json()
    assert row['company_id'] == 'LOG-B'
    assert client.get('/api/shipments/' + row['id'], headers=auth('logistics')).status_code == 404
    route = dict(id='ROAD-B', name='B road', delay_hours=0)
    path = '/api/shipments/' + row['id'] + '/assignment'
    assert client.put(path, headers=company_b, json=dict(truck_id='TRK-101', route=route)).status_code == 404
    assert client.put(path, headers=company_b, json=dict(truck_id='TRK-B', route=route)).status_code == 200
    assert client.post('/api/port-requests', headers=company_b, json=dict(shipment_id=row['id'], kind='handling', requested_at='2026-12-01T00:00:00Z')).status_code == 201
    assert client.patch('/api/route-requests/REQ-B', headers=company_b, json=dict(status='approved', option_id='OPT-B', reason='B approves')).status_code == 200
    assert client.get('/api/port/dashboard', headers=company_b).status_code == 403
    assert client.get('/api/crisis/health', headers=company_b).status_code == 403


def test_foreign_truck_is_not_exposed_via_bad_assignment(tenants):
    client, _ = tenants
    with connection.transaction() as state:
        state['shipments'][0]['truck_id'] = 'TRK-B'
    rows = client.get('/api/logistics/dashboard', headers=auth('logistics')).json()['vehicles']
    assert all(v['company_id'] == 'LOG-101' for v in rows)


def test_shared_alert_acknowledgments_are_private_and_independent(tenants):
    client, company_b = tenants
    shared = client.post('/api/alerts', headers=auth('port'), json=dict(message='Port approach flooded')).json()
    path = '/api/alerts/' + shared['id'] + '/read'
    assert client.patch(path, headers=auth('driver')).status_code == 200
    assert client.patch(path, headers=company_b).json()['read_by'] == ['user-b']
    for endpoint in ['/api/alerts', '/api/logistics/dashboard']:
        data = client.get(endpoint, headers=auth('logistics')).json()
        row = (data if isinstance(data, list) else data['alerts'])[0]
        assert row['recipient_ids'] == ['logistics-demo'] and row['read_by'] == []
    result = client.patch(path, headers=auth('logistics')).json()
    assert result['read_by'] == result['recipient_ids'] == ['logistics-demo']
    with connection.transaction() as state:
        saved = next(a for a in state['alerts'] if a['id'] == shared['id'])
        assert set(saved['read_by']) == {'logistics-demo', 'user-b', 'driver-demo'}
    private = client.post('/api/alerts', headers=auth('port'), json=dict(message='Private B warning', shipment_ids=['SHP-B'])).json()
    assert private['id'] not in {a['id'] for a in client.get('/api/alerts', headers=auth('logistics')).json()}
    assert client.patch('/api/alerts/' + private['id'] + '/read', headers=auth('logistics')).status_code == 404


@pytest.mark.parametrize('role,field', [('logistics', 'company_id'), ('driver', 'asset_id'), ('captain', 'asset_id'), ('port', 'port_id')])
def test_incomplete_mapping_fails_closed(tenants, role, field):
    client, _ = tenants
    with connection.transaction() as state:
        user = next(u for u in state['users'] if u['role'] == role)
        user[field] = None
    assert client.get('/api/me', headers=auth(role)).status_code == 403
    assert client.get(f'/api/{role}/dashboard', headers=auth(role)).status_code == 403
    assert not visible(user, dict(company_id=None, vessel_id=None, truck_id=None, port_id=None))


def test_logistics_cannot_mutate_other_role_resources(tenants):
    client, company_b = tenants
    for headers in [auth('logistics'), company_b]:
        assert client.post('/api/tracking/location', headers=headers, json=dict(lat=12, lng=74, observed_at='2026-01-01T00:00:00Z')).status_code == 403
        assert client.post('/api/vessels/VES-101/events', headers=headers, json=dict(event='arrived')).status_code == 403
        assert client.post('/api/shipments/SHP-101/events', headers=headers, json=dict(event='unloaded')).status_code == 403
        assert client.get('/api/docking-requests', headers=headers).status_code == 403
