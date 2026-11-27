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
