import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import connection

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(connection, 'path', tmp_path/'state.json')
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection.settings, 'demo_mode', True)
    return TestClient(app, headers={'Authorization':'Bearer local-port-demo'})

def test_auth(client):
    assert client.get('/api/port/dashboard',headers={'Authorization':''}).status_code == 401
    assert client.get('/api/port/dashboard',headers={'Authorization':'Bearer wrong'}).status_code == 401

def test_approval_atomic_and_duplicate(client):
    client.headers['Authorization']='Bearer local-logistics-demo'
    before=client.get('/api/shipments/SHP-102').json()
    body={'status':'approved','option_id':'OPT-1','reason':'Keep cargo chilled'}
    assert client.patch('/api/route-requests/REQ-101',json=body).status_code==200
    assert client.patch('/api/route-requests/REQ-101',json=body).status_code==409
    after=client.get('/api/shipments/SHP-102').json()
    assert after['eta_hours']==before['eta_hours']+2
    assert len(client.get('/api/alerts').json())==1

def test_invalid_option_no_change(client):
    client.headers['Authorization']='Bearer local-logistics-demo'
    assert client.patch('/api/route-requests/REQ-101',json={'status':'approved','option_id':'bad','reason':'Test reason'}).status_code==422
    assert client.get('/api/route-requests').json()[0]['status']=='pending'

def test_incident_lifecycle(client):
    assert client.patch('/api/incidents/INC-101',json={'status':'resolved'}).status_code==409
    assert client.patch('/api/incidents/INC-101',json={'status':'confirmed'}).status_code==200
    assert client.patch('/api/incidents/INC-101',json={'status':'resolved'}).status_code==200

def test_simulation_read_only(client):
    before=client.get('/api/port/dashboard').json()
    a=client.post('/api/simulation/run',json={'duration_hours':12,'severity':'high'}).json()
    b=client.post('/api/simulation/run',json={'duration_hours':24,'severity':'high'}).json()
    assert b['impacts'][0]['delay_hours']>a['impacts'][0]['delay_hours']
    assert client.get('/api/port/dashboard').json()==before
    assert client.post('/api/simulation/run',json={'duration_hours':-1}).status_code==422

def test_alert_acknowledgment(client):
    row=client.post('/api/alerts',json={'message':'Gate two closed'}).json()
    for _ in range(2): assert client.patch('/api/alerts/'+row['id']+'/read').status_code==200
    assert client.get('/api/alerts').json()[0]['read_by']==['authority-demo']


def test_alternative_time_slot_port_and_docking_requests(client):
    # 1. Create a port handling request as logistics
    pr = client.post(
        '/api/port-requests',
        headers={'Authorization': 'Bearer local-logistics-demo'},
        json={'shipment_id': 'SHP-101', 'kind': 'handling', 'requested_at': '2026-12-01T10:00:00Z'},
    )
    assert pr.status_code == 201
    pr_id = pr.json()['id']

    # Invalid window (end <= start) rejected with 422
    bad = client.patch(
        f'/api/port-requests/{pr_id}',
        json={
            'status': 'slot_suggested',
            'reason': 'Invalid window test',
            'suggested_start': '2026-12-01T14:00:00Z',
            'suggested_end': '2026-12-01T12:00:00Z',
        },
    )
    assert bad.status_code == 422

    # Valid alternative slot suggestion for port request
    res = client.patch(
        f'/api/port-requests/{pr_id}',
        json={
            'status': 'slot_suggested',
            'reason': 'Morning berth busy, use afternoon window',
            'suggested_start': '2026-12-01T14:00:00Z',
            'suggested_end': '2026-12-01T16:00:00Z',
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data['status'] == 'slot_suggested'
    assert data['requested_at'] == '2026-12-01T10:00:00Z'
    assert data['suggested_start'].startswith('2026-12-01T14:00:00')
    assert data['suggested_end'].startswith('2026-12-01T16:00:00')
    assert data.get('slot') is None
    # Must NOT reserve cold capacity on suggestion
    assert client.get('/api/ports/NMP/capacity').json()['cold_occupied'] == 168

    # Can still approve after suggestion
    appr = client.patch(
        f'/api/port-requests/{pr_id}',
        json={'status': 'approved', 'reason': 'Confirmed afternoon slot', 'slot': '2026-12-01T14:00:00Z'},
    )
    assert appr.status_code == 200
    assert appr.json()['status'] == 'approved'

    # 2. Create docking request as captain and suggest alternative window
    dr = client.post(
        '/api/docking-requests',
        headers={'Authorization': 'Bearer local-captain-demo'},
        json={'vessel_id': 'VES-101', 'eta': '2026-12-01T10:00:00Z'},
    )
    assert dr.status_code == 201
    dr_id = dr.json()['id']

    dr_res = client.patch(
        f'/api/docking-requests/{dr_id}',
        json={
            'status': 'slot_suggested',
            'reason': 'Tide window shift',
            'suggested_start': '2026-12-01T15:00:00Z',
            'suggested_end': '2026-12-01T17:00:00Z',
        },
    )
    assert dr_res.status_code == 200
    dr_data = dr_res.json()
    assert dr_data['status'] == 'slot_suggested'
    assert dr_data['eta'] == '2026-12-01T10:00:00Z'
    assert dr_data['suggested_start'].startswith('2026-12-01T15:00:00')
    assert client.get('/api/ports/NMP/capacity').json()['occupied_berths'] == 5


def test_docking_priority_and_operational_safety(client):
    from datetime import datetime, timezone
    from app.services.port_service import evaluate_docking_request, enrich_docking_requests

    # Setup two vessels: VES-101 (cold cargo) and VES-STD (standard cargo)
    with connection.transaction() as s:
        s['vessels'].append(dict(id='VES-STD', name='Bulk Runner', status='Approaching', lat=12.85, lng=74.65, destination_port_id='NMP', source='Kochi'))
        s['shipments'].append(dict(
            id='SHP-STD', cargo='Dry timber', quantity=10, port_id='NMP', vessel_id='VES-STD',
            truck_id=None, status='at_sea', destination='Mangalore yard', temperature=22,
            max_temperature=30, eta_hours=10, company_id='LOG-101', origin='Kochi',
            requires_cold=False, events=[]
        ))
        req_cold = dict(id='D-COLD', vessel_id='VES-101', port_id='NMP', eta='2026-12-01T10:00:00Z', status='pending', created_at='2026-12-01T08:00:00Z')
        req_std_old = dict(id='D-STD-OLD', vessel_id='VES-STD', port_id='NMP', eta='2026-12-01T10:00:00Z', status='pending', created_at='2026-12-01T02:00:00Z')
        req_std_new = dict(id='D-STD-NEW', vessel_id='VES-STD', port_id='NMP', eta='2026-12-01T10:00:00Z', status='pending', created_at='2026-12-01T09:00:00Z')
        s['docking_requests'].extend([req_std_new, req_cold, req_std_old])

    ref = datetime(2026, 12, 1, 9, 30, tzinfo=timezone.utc)
    with connection.transaction() as s:
        e_cold = evaluate_docking_request(s, s['docking_requests'][1], reference_time=ref)
        e_old = evaluate_docking_request(s, s['docking_requests'][2], reference_time=ref)
        e_new = evaluate_docking_request(s, s['docking_requests'][0], reference_time=ref)
        assert e_cold['priority_breakdown']['perishable'] >= 25.0
        assert e_old['priority_breakdown']['waiting_time'] > e_new['priority_breakdown']['waiting_time']

        ordered_a = enrich_docking_requests(s, s['docking_requests'], reference_time=ref)
        ordered_b = enrich_docking_requests(s, list(reversed(s['docking_requests'])), reference_time=ref)
        assert [r['id'] for r in ordered_a] == [r['id'] for r in ordered_b]
        assert ordered_a[0]['id'] == 'D-COLD'
        assert ordered_a[0]['recommended_order'] == 1

    # Approve handling for SHP-101 so only berth/port/capacity checks apply
    pr = client.post('/api/port-requests', headers={'Authorization': 'Bearer local-logistics-demo'}, json={'shipment_id': 'SHP-101', 'kind': 'handling', 'requested_at': '2026-12-01T10:00:00Z'}).json()
    assert client.patch(f"/api/port-requests/{pr['id']}", json={'status': 'approved', 'reason': 'Handling OK', 'slot': '2026-12-01T10:00:00Z'}).status_code == 200

    # Berth incompatibility blocks approval (B1 is non-cold berth for cold vessel VES-101)
    bad_berth = client.patch('/api/docking-requests/D-COLD', json={'status': 'approved', 'reason': 'Try B1', 'slot': '2026-12-01T10:00:00Z', 'berth': 'B1'})
    assert bad_berth.status_code == 409

    # Unavailable handling capacity blocks approval
    with connection.transaction() as s:
        s['port']['handling_occupied'] = 495
    low_cap = client.patch('/api/docking-requests/D-COLD', json={'status': 'approved', 'reason': 'Try low cap', 'slot': '2026-12-01T10:00:00Z', 'berth': 'B6'})
    assert low_cap.status_code == 409

    # Closed port blocks approval regardless of priority score
    with connection.transaction() as s:
        s['port']['handling_occupied'] = 180
        s['port']['status'] = 'closed'
    closed = client.patch('/api/docking-requests/D-COLD', json={'status': 'approved', 'reason': 'Try closed port', 'slot': '2026-12-01T10:00:00Z', 'berth': 'B6'})
    assert closed.status_code == 409


def test_yard_and_handling_capacity_updates(client):
    # Update yard and handling capacity alongside existing fields
    res = client.patch(
        '/api/ports/NMP/capacity',
        json={
            'status': 'open',
            'berths': 8,
            'occupied_berths': 5,
            'cold_capacity': 240,
            'cold_occupied': 168,
            'yard_capacity': 1200,
            'yard_occupied': 500,
            'handling_capacity': 600,
            'handling_occupied': 200,
        },
    )
    assert res.status_code == 200
    cap = client.get('/api/ports/NMP/capacity').json()
    assert cap['yard_capacity'] == 1200
    assert cap['yard_occupied'] == 500
    assert cap['handling_capacity'] == 600
    assert cap['handling_occupied'] == 200
    assert cap['berths'] == 8 and cap['cold_capacity'] == 240

    # Partial update without yard/handling preserves existing values
    res2 = client.patch(
        '/api/ports/NMP/capacity',
        json={'status': 'restricted', 'berths': 8, 'occupied_berths': 5, 'cold_capacity': 240, 'cold_occupied': 168},
    )
    assert res2.status_code == 200
    cap2 = client.get('/api/ports/NMP/capacity').json()
    assert cap2['status'] == 'restricted'
    assert cap2['yard_capacity'] == 1200
    assert cap2['handling_capacity'] == 600

    # Negative capacity rejected (422)
    neg = client.patch(
        '/api/ports/NMP/capacity',
        json={'status': 'open', 'berths': 8, 'occupied_berths': 5, 'cold_capacity': 240, 'cold_occupied': 168, 'yard_capacity': -10},
    )
    assert neg.status_code == 422

    # Occupancy exceeding capacity rejected (422)
    over = client.patch(
        '/api/ports/NMP/capacity',
        json={'status': 'open', 'berths': 8, 'occupied_berths': 5, 'cold_capacity': 240, 'cold_occupied': 168, 'handling_capacity': 300, 'handling_occupied': 350},
    )
    assert over.status_code == 422
