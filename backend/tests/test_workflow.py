import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import connection
from app.database.collections import legacy_seed, migrate

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(connection,'path',tmp_path/'state.json')
    monkeypatch.setattr(connection.settings,'mongodb_uri','')
    monkeypatch.setattr(connection.settings,'demo_mode',True)
    return TestClient(app)

def auth(role): return {'Authorization':f'Bearer local-{role}-demo'}

def test_roles_and_tenant_isolation(client):
    for role in ['port','logistics','driver','captain']:
        assert client.get(f'/api/{role}/dashboard',headers=auth(role)).status_code==200
    assert client.get('/api/port/dashboard',headers=auth('driver')).status_code==403
    assert client.get('/api/shipments/SHP-102',headers=auth('driver')).status_code==404
    decision=dict(status='approved',option_id='OPT-1',reason='Choose chilled storage')
    for role in ['port','driver','captain']:
        assert client.patch('/api/route-requests/REQ-101',json=decision,headers=auth(role)).status_code==403
    with connection.transaction() as s:
        s['shipments'][1]['company_id']='OTHER'
    assert client.get('/api/shipments/SHP-102',headers=auth('logistics')).status_code==404
    assert client.patch('/api/route-requests/REQ-101',json=decision,headers=auth('logistics')).status_code==404

def test_warning_shared_but_ack_independent(client):
    response=client.post('/api/alerts',headers=auth('port'),json={'message':'Road flooded','shipment_ids':['SHP-101']})
    assert response.status_code==201
    aid=response.json()['id']
    for role in ['logistics','driver']:
        assert client.get('/api/alerts',headers=auth(role)).json()[0]['id']==aid
    client.patch(f'/api/alerts/{aid}/read',headers=auth('driver'))
    assert client.get('/api/alerts',headers=auth('logistics')).json()[0]['read_by']==[]
    assert client.get('/api/alerts',headers=auth('port')).json()[0]['read_by']==['driver-demo']

def test_full_consignment_journey(client):
    def post(path,role,body,code=201):
        r=client.post('/api'+path,headers=auth(role),json=body)
        assert r.status_code==code,r.text
        return r.json()
    def approve(path):
        r=client.patch('/api'+path,headers=auth('port'),json={'status':'approved','reason':'Capacity available','slot':'2026-12-01T10:00:00Z'})
        assert r.status_code==200,r.text
    # Seed shipment and a new consignment share the vessel, so both need handling approval.
    sh=post('/shipments','logistics',dict(cargo='Fish',quantity=5,origin='Kochi',destination='Udupi',vessel_id='VES-101',requires_cold=True,temperature=2,max_temperature=4))
    sid=sh['id']
    route=dict(id='ROAD-1',name='Planned road route',delay_hours=0)
    assert client.put(f'/api/shipments/{sid}/assignment',headers=auth('logistics'),json=dict(truck_id='TRK-101',route=route)).status_code==200
    for target in ['SHP-101',sid]:
        req=post('/port-requests','logistics',dict(shipment_id=target,kind='handling',requested_at='2026-12-01T10:00:00Z'))
        approve('/port-requests/'+req['id'])
    access=post('/port-requests','logistics',dict(shipment_id=sid,kind='truck_access',requested_at='2026-12-01T10:00:00Z'))
    approve('/port-requests/'+access['id'])
    dock=post('/docking-requests','captain',dict(vessel_id='VES-101',eta='2026-12-01T10:00:00Z'))
    assert dock['priority']==1
    r=client.patch('/api/docking-requests/'+dock['id'],headers=auth('port'),json=dict(status='approved',reason='Compatible berth confirmed',slot='2026-12-01T10:00:00Z',berth='B6'))
    assert r.status_code==200,r.text
    for event in ['departed','arrived','docked']:
        post('/vessels/VES-101/events','captain',dict(event=event,eta_hours=2),200)
    # Arrival and docking alone must not permit pickup.
    post(f'/shipments/{sid}/events','driver',dict(event='picked_up'),409)
    for event in ['unloaded','ready_for_pickup']:
        post(f'/shipments/{sid}/events','port',dict(event=event),200)
    incident=post('/incidents','driver',dict(shipment_id=sid,category='flood',severity='high',description='Road is flooded',lat=13,lng=74))
    assert incident['status']=='reported'
    req=post('/route-requests','driver',dict(shipment_id=sid,reason='Flooded road',options=[dict(id='ALT',name='Alternative',delay_hours=1)]))
    decision=dict(status='approved',option_id='ALT',reason='Approved by dispatcher')
    assert client.patch('/api/route-requests/'+req['id'],headers=auth('logistics'),json=decision).status_code==200
    assert client.patch('/api/route-requests/'+req['id'],headers=auth('logistics'),json=decision).status_code==409
    for event in ['picked_up','delivered']:
        post(f'/shipments/{sid}/events','driver',dict(event=event),200)
    stored=client.get('/api/shipments/'+sid,headers=auth('logistics')).json()
    assert stored['status']=='delivered' and stored['route_id']=='ALT' and not stored['cold_reserved']
    assert any(sid in a['message'] and 'departed' in a['message'] for a in client.get('/api/alerts',headers=auth('logistics')).json())

def test_capacity_failure_rolls_back(client):
    with connection.transaction() as s: s['port']['cold_occupied']=240
    r=client.post('/api/port-requests',headers=auth('logistics'),json=dict(shipment_id='SHP-101',kind='handling',requested_at='2026-12-01T10:00:00Z')).json()
    result=client.patch('/api/port-requests/'+r['id'],headers=auth('port'),json=dict(status='approved',reason='Try approval',slot='2026-12-01T10:00:00Z'))
    assert result.status_code==409
    assert client.get('/api/port-requests',headers=auth('logistics')).json()[0]['status']=='pending'

def test_location_ownership_and_stale_update(client):
    body=dict(lat=12,lng=74,observed_at='2026-01-01T00:00:00Z')
    assert client.post('/api/tracking/location',headers=auth('driver'),json=body).json()['id']=='TRK-101'
    assert client.post('/api/tracking/location',headers=auth('driver'),json=body).status_code==409
    assert client.post('/api/tracking/location',headers=auth('logistics'),json=body).status_code==403

def test_weather_failure_does_not_block_reports(client,monkeypatch):
    from app.services import weather
    import httpx
    weather._cache.clear()
    def fail(*args,**kwargs): raise httpx.ConnectError('offline')
    monkeypatch.setattr(weather.httpx,'get',fail)
    assert client.get('/api/ports/NMP/weather',headers=auth('port')).status_code==503
    assert client.post('/api/incidents',headers=auth('driver'),json=dict(shipment_id='SHP-101',category='distress',severity='high',description='Urgent assistance',lat=12,lng=74)).status_code==201

def test_migration_preserves_records():
    state=legacy_seed(); state['shipments'][0]['eta_hours']=99
    migrate(state); migrate(state)
    assert state['shipments'][0]['eta_hours']==99
    assert len(state['users'])==4 and state['schema_version']==2

def test_docking_requires_handling_approval_and_open_port(client):
    req=client.post('/api/docking-requests',headers=auth('captain'),json=dict(vessel_id='VES-101',eta='2026-12-01T10:00:00Z')).json()
    body=dict(status='approved',reason='Request review',slot='2026-12-01T10:00:00Z',berth='B6')
    assert client.patch('/api/docking-requests/'+req['id'],headers=auth('port'),json=body).status_code==409
    assert client.post('/api/vessels/VES-101/events',headers=auth('captain'),json=dict(event='arrived')).status_code==200
    assert client.post('/api/vessels/VES-101/events',headers=auth('captain'),json=dict(event='docked')).status_code==409
    assert client.get('/api/ports/NMP/capacity',headers=auth('port')).json()['occupied_berths']==5

def test_timestamps_and_spoofed_reporter_rejected(client):
    assert client.post('/api/port-requests',headers=auth('logistics'),json=dict(shipment_id='SHP-101',kind='handling',requested_at='2026-12-01T10:00:00')).status_code==422
    assert client.post('/api/incidents',headers=auth('driver'),json=dict(shipment_id='SHP-101',category='flood',severity='high',description='Flood report',lat=12,lng=74,reporter_id='someone-else')).status_code==422

def test_driver_geometry_persists_only_after_logistics_approval(client):
    option = dict(id='ROAD-ALT',name='Inland alternative',delay_hours=1,points=[[13.0,74.8],[13.2,74.9]],distance=20000,duration=3600,source='OSRM road route')
    response = client.post('/api/route-requests',headers=auth('driver'),json=dict(shipment_id='SHP-101',reason='Road blocked',options=[option]))
    assert response.status_code==201
    rid=response.json()['id']
    assert not client.get('/api/shipments/SHP-101',headers=auth('driver')).json().get('route')
    decision=dict(status='approved',option_id='ROAD-ALT',reason='Checked alternate route')
    assert client.patch('/api/route-requests/'+rid,headers=auth('port'),json=decision).status_code==403
    assert client.patch('/api/route-requests/'+rid,headers=auth('logistics'),json=decision).status_code==200
    dashboard=client.get('/api/driver/dashboard',headers=auth('driver')).json()
    assert dashboard['shipments'][0]['route']['points']==option['points']
    option['points'][0][0]=200
    assert client.post('/api/route-requests',headers=auth('driver'),json=dict(shipment_id='SHP-101',reason='Invalid geometry',options=[option])).status_code==422
