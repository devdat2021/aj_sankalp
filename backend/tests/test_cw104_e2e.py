import pytest
import time
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from cryptography.hazmat.primitives.asymmetric import rsa
import jwt

from app.main import app
from app.database import connection
from app.database.collections import seed
from app.api import workflow as workflow_api
from app.core import security


@pytest.fixture
def mock_db(tmp_path, monkeypatch):
    """Sets up an isolated database state for each test."""
    monkeypatch.setattr(connection, 'path', tmp_path / 'state.json')
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection.settings, 'demo_mode', True)


def auth_header(role):
    return {'Authorization': f'Bearer local-{role}-demo'}


# ==============================================================================
# SECTION 1 & 2 & 3: COMPLETE 7-STEP CW-104 CONSIGNMENT LIFECYCLE
# ==============================================================================

def test_cw104_complete_lifecycle(mock_db):
    """
    Tests the complete 7-step lifecycle for consignment CW-104:
    Step 1: Consignment creation & Sea Leg (explicit departure notification)
    Step 2: Port docking clearance & actual vessel arrival separation
    Step 3: Truck assignment, road routing & port access slot
    Step 4: Cargo unloading & pickup readiness separation
    Step 5: Driver pickup & in-transit telemetry
    Step 6: Hazard reporting, stopped state & reroute approval
    Step 7: Final delivery & audit trail
    """
    client = TestClient(app)

    # --------------------------------------------------------------------------
    # STEP 1: Consignment Creation & Sea Leg
    # --------------------------------------------------------------------------
    # Logistics creates consignment CW-104 aboard VES-101
    sh_payload = {
        'cargo': 'Frozen Prawns (CW-104)',
        'quantity': 10,
        'port_id': 'NMP',
        'origin': 'Kochi Port',
        'destination': 'Udupi Cold Storage',
        'vessel_id': 'VES-101',
        'requires_cold': True,
        'temperature': 2.0,
        'max_temperature': 4.0,
        'eta_hours': 8.0
    }
    r_create = client.post('/api/shipments', headers=auth_header('logistics'), json=sh_payload)
    assert r_create.status_code == 201, r_create.text
    cw104 = r_create.json()
    cid = cw104['id']
    assert cw104['status'] == 'planned'
    assert cw104['vessel_id'] == 'VES-101'

    # Verify NO departure notification has been triggered yet on creation
    alerts_before = client.get('/api/alerts', headers=auth_header('logistics')).json()
    assert not any(cid in a['message'] and 'departed' in a['message'] for a in alerts_before)

    # Captain explicitly records departure event
    r_dep = client.post('/api/vessels/VES-101/events', headers=auth_header('captain'),
                        json={'event': 'departed', 'eta_hours': 8.0})
    assert r_dep.status_code == 200, r_dep.text

    # Verify vessel status is departed and consignment status is at_sea
    vessel = client.get('/api/captain/dashboard', headers=auth_header('captain')).json()['vessels'][0]
    assert vessel['movement_status'] == 'departed'
    sh_after_dep = client.get(f'/api/shipments/{cid}', headers=auth_header('logistics')).json()
    assert sh_after_dep['status'] == 'at_sea'

    # Verify departure notification to logistics companies is triggered ONLY after explicit departure
    alerts_after_dep = client.get('/api/alerts', headers=auth_header('logistics')).json()
    dep_alert = next((a for a in alerts_after_dep if cid in a['message'] and 'departed' in a['message']), None)
    assert dep_alert is not None
    assert 'estimated arrival in 8.0 hours' in dep_alert['message'] or 'ETA 8.0 hours' in dep_alert['message']

    # Captain updates marine location and ETA while at sea
    past_time_1 = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    r_loc = client.post('/api/tracking/location', headers=auth_header('captain'),
                        json={'lat': 12.85, 'lng': 74.65, 'observed_at': past_time_1})
    assert r_loc.status_code == 200

    r_eta = client.patch('/api/vessels/VES-101/eta', headers=auth_header('captain'),
                         json={'eta_hours': 7.5})
    assert r_eta.status_code == 200
    assert r_eta.json()['eta_hours'] == 7.5

    # --------------------------------------------------------------------------
    # STEP 2: Port Docking Clearance & Actual Vessel Arrival Separation
    # --------------------------------------------------------------------------
    # Captain requests docking clearance
    dock_req = client.post('/api/docking-requests', headers=auth_header('captain'),
                           json={'vessel_id': 'VES-101', 'port_id': 'NMP', 'eta': '2026-11-27T14:00:00Z'}).json()
    assert dock_req['priority'] == 1  # Refrigerated cargo gives priority

    # Port handling request must be approved first for cold storage
    handling_req = client.post('/api/port-requests', headers=auth_header('logistics'),
                               json={'shipment_id': cid, 'kind': 'handling', 'requested_at': '2026-11-27T14:00:00Z'}).json()
    # Also approve existing seed shipment SHP-101 handling so vessel berths
    client.post('/api/port-requests', headers=auth_header('logistics'),
                json={'shipment_id': 'SHP-101', 'kind': 'handling', 'requested_at': '2026-11-27T14:00:00Z'})
    client.patch(f"/api/port-requests/{handling_req['id']}", headers=auth_header('port'),
                 json={'status': 'approved', 'reason': 'Cold capacity confirmed', 'slot': '2026-11-27T14:00:00Z'})
    for pr in client.get('/api/port-requests', headers=auth_header('port')).json():
        if pr['kind'] == 'handling' and pr['status'] == 'pending':
            client.patch(f"/api/port-requests/{pr['id']}", headers=auth_header('port'),
                         json={'status': 'approved', 'reason': 'Approved', 'slot': '2026-11-27T14:00:00Z'})

    # Port Operations approves docking request with Berth B6
    r_dock_app = client.patch(f"/api/docking-requests/{dock_req['id']}", headers=auth_header('port'),
                              json={'status': 'approved', 'reason': 'Berth B6 allocated', 'slot': '2026-11-27T14:00:00Z', 'berth': 'B6'})
    assert r_dock_app.status_code == 200, r_dock_app.text

    # Captain records actual physical arrival in port waters (separate from docking!)
    r_arr = client.post('/api/vessels/VES-101/events', headers=auth_header('captain'),
                        json={'event': 'arrived', 'eta_hours': 0.5})
    assert r_arr.status_code == 200

    # Consignment status is now arrived in port waters
    assert client.get(f'/api/shipments/{cid}', headers=auth_header('logistics')).json()['status'] == 'arrived'

    # Captain records physical docking at allocated berth
    r_dock = client.post('/api/vessels/VES-101/events', headers=auth_header('captain'),
                         json={'event': 'docked', 'eta_hours': 0.0})
    assert r_dock.status_code == 200
    assert client.get(f'/api/shipments/{cid}', headers=auth_header('logistics')).json()['status'] == 'at_port'

    # --------------------------------------------------------------------------
    # STEP 3: Fleet Assignment & Port Access Slot
    # --------------------------------------------------------------------------
    # Logistics assigns truck TRK-101 and initial road route
    route_option = {
        'id': 'ROUTE-COASTAL-1',
        'name': 'NH66 Coastal Highway',
        'delay_hours': 0.0,
        'cost': 1200,
        'risk': 10,
        'simulated': True,
        'points': [[12.94, 74.83], [13.09, 74.79], [13.34, 74.75]],
        'distance': 45000,
        'duration': 3600,
        'source': 'OSRM Coastal Highway'
    }
    r_assign = client.put(f'/api/shipments/{cid}/assignment', headers=auth_header('logistics'),
                          json={'truck_id': 'TRK-101', 'route': route_option})
    assert r_assign.status_code == 200, r_assign.text

    # Logistics requests truck port access slot
    access_req = client.post('/api/port-requests', headers=auth_header('logistics'),
                             json={'shipment_id': cid, 'kind': 'truck_access', 'requested_at': '2026-11-27T15:00:00Z'}).json()
    # Port Operations approves truck access slot
    client.patch(f"/api/port-requests/{access_req['id']}", headers=auth_header('port'),
                 json={'status': 'approved', 'reason': 'Gate 2 access approved', 'slot': '2026-11-27T15:00:00Z'})

    # --------------------------------------------------------------------------
    # STEP 4: Cargo Unloading & Pickup Readiness Separation
    # --------------------------------------------------------------------------
    # Attempting driver pickup while cargo is still at_port must fail (409)
    assert client.post(f'/api/shipments/{cid}/events', headers=auth_header('driver'),
                       json={'event': 'picked_up'}).status_code == 409

    # Port Operations records cargo unloaded
    r_unload = client.post(f'/api/shipments/{cid}/events', headers=auth_header('port'),
                           json={'event': 'unloaded'})
    assert r_unload.status_code == 200
    assert client.get(f'/api/shipments/{cid}', headers=auth_header('logistics')).json()['status'] == 'unloaded'

    # Driver pickup still must fail because cargo is unloaded but not cleared/ready for pickup
    assert client.post(f'/api/shipments/{cid}/events', headers=auth_header('driver'),
                       json={'event': 'picked_up'}).status_code == 409

    # Port Operations records ready_for_pickup
    r_ready = client.post(f'/api/shipments/{cid}/events', headers=auth_header('port'),
                          json={'event': 'ready_for_pickup'})
    assert r_ready.status_code == 200
    assert client.get(f'/api/shipments/{cid}', headers=auth_header('logistics')).json()['status'] == 'ready_for_pickup'

    # --------------------------------------------------------------------------
    # STEP 5: Driver Pickup & In-Transit Telemetry
    # --------------------------------------------------------------------------
    # Driver confirms pickup
    r_pickup = client.post(f'/api/shipments/{cid}/events', headers=auth_header('driver'),
                           json={'event': 'picked_up'})
    assert r_pickup.status_code == 200, r_pickup.text
    sh_in_transit = client.get(f'/api/shipments/{cid}', headers=auth_header('driver')).json()
    assert sh_in_transit['status'] == 'in_transit'
    assert not sh_in_transit.get('cold_reserved')  # Cold capacity released from port

    # Driver sends live GPS position
    past_time_2 = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    r_trk_loc = client.post('/api/tracking/location', headers=auth_header('driver'),
                            json={'lat': 13.02, 'lng': 74.80, 'observed_at': past_time_2})
    assert r_trk_loc.status_code == 200

    # --------------------------------------------------------------------------
    # STEP 6: Hazard Reporting, Stopped State & Reroute Approval
    # --------------------------------------------------------------------------
    # Driver encounters a flood near Mulki and reports hazard
    inc_payload = {
        'shipment_id': cid,
        'category': 'flood',
        'severity': 'high',
        'description': 'Severe waterlogging at Mulki bypass; road impassable for trucks.',
        'lat': 13.09,
        'lng': 74.79
    }
    r_inc = client.post('/api/incidents', headers=auth_header('driver'), json=inc_payload)
    assert r_inc.status_code == 201, r_inc.text
    incident = r_inc.json()
    assert incident['status'] == 'reported'

    # Check vehicle and shipment entered Stopped / Unable to continue state
    driver_dash = client.get('/api/driver/dashboard', headers=auth_header('driver')).json()
    truck_veh = next(v for v in driver_dash['vehicles'] if v['id'] == 'TRK-101')
    assert truck_veh['status'] == 'Stopped / Unable to continue'
    assert truck_veh.get('hazard_stopped') is True

    sh_stopped = client.get(f'/api/shipments/{cid}', headers=auth_header('driver')).json()
    assert sh_stopped.get('hazard_stopped') is True
    assert 'flood' in sh_stopped.get('hazard_reason', '').lower()

    # Driver CANNOT progress to delivery while hazard-stopped (route progression is blocked)
    r_prog_blocked = client.post(f'/api/shipments/{cid}/events', headers=auth_header('driver'),
                                 json={'event': 'delivered'})
    assert r_prog_blocked.status_code == 409
    assert 'stopped due to reported hazard' in r_prog_blocked.json()['detail']

    # Driver requests safe inland diversion route
    detour_option = {
        'id': 'ROUTE-INLAND-DETOUR',
        'name': 'Kinnigoli-Belman Inland Detour',
        'delay_hours': 1.5,
        'cost': 2500,
        'risk': 15,
        'simulated': True,
        'points': [[13.02, 74.80], [13.12, 74.88], [13.25, 74.86], [13.34, 74.75]],
        'distance': 62000,
        'duration': 5400,
        'source': 'OSRM Inland Detour'
    }
    r_reroute = client.post('/api/route-requests', headers=auth_header('driver'),
                            json={'shipment_id': cid, 'reason': 'Mulki flood detour', 'options': [detour_option]})
    assert r_reroute.status_code == 201
    reroute_id = r_reroute.json()['id']

    # Logistics Company approves the reroute
    r_decide = client.patch(f'/api/route-requests/{reroute_id}', headers=auth_header('logistics'),
                            json={'status': 'approved', 'option_id': 'ROUTE-INLAND-DETOUR', 'reason': 'Inland detour cleared by operations'})
    assert r_decide.status_code == 200

    # Stopped state is cleared and route is updated
    sh_cleared = client.get(f'/api/shipments/{cid}', headers=auth_header('driver')).json()
    assert sh_cleared.get('hazard_stopped') is False
    assert sh_cleared['route_id'] == 'ROUTE-INLAND-DETOUR'

    # --------------------------------------------------------------------------
    # STEP 7: Final Delivery & Consignment Completion
    # --------------------------------------------------------------------------
    # Driver safely completes delivery along approved route
    r_deliv = client.post(f'/api/shipments/{cid}/events', headers=auth_header('driver'),
                          json={'event': 'delivered'})
    assert r_deliv.status_code == 200, r_deliv.text
    final_sh = client.get(f'/api/shipments/{cid}', headers=auth_header('logistics')).json()
    assert final_sh['status'] == 'delivered'

    # Verify complete events log in consignment history
    event_names = [e['event'] for e in final_sh['events']]
    assert 'departed' in event_names
    assert 'arrived' in event_names
    assert 'docked' in event_names
    assert 'unloaded' in event_names
    assert 'ready_for_pickup' in event_names
    assert 'picked_up' in event_names
    assert 'delivered' in event_names


# ==============================================================================
# SECTION 2: HAZARD SAFETY CATEGORIES AND PROGRESSION STOP
# ==============================================================================

@pytest.mark.parametrize("category", ['flood', 'roadblock', 'breakdown', 'refrigeration'])
def test_all_hazard_categories_halt_progression(mock_db, category):
    """
    Verifies that floods, roadblocks, breakdowns, and refrigeration failures
    all trigger the explicit Stopped / Unable to Continue state and halt progression.
    """
    client = TestClient(app)

    # Use existing in-transit shipment SHP-101 which is assigned to TRK-101 (driver-demo)
    # Put SHP-101 in in_transit state
    with connection.transaction() as s:
        s1 = next(item for item in s['shipments'] if item['id'] == 'SHP-101')
        s1['status'] = 'in_transit'

    r_inc = client.post('/api/incidents', headers=auth_header('driver'), json={
        'shipment_id': 'SHP-101',
        'category': category,
        'severity': 'high',
        'description': f'Test {category} hazard occurred on transit corridor.',
        'lat': 13.09,
        'lng': 74.79
    })
    assert r_inc.status_code == 201

    # Check that driver's vehicle and shipment are in Stopped / Unable to continue state
    dash = client.get('/api/driver/dashboard', headers=auth_header('driver')).json()
    sh = next(s for s in dash['shipments'] if s['id'] == 'SHP-101')
    assert sh.get('hazard_stopped') is True

    # Attempting to deliver while hazard is active is prohibited
    r_deliv = client.post('/api/shipments/SHP-101/events', headers=auth_header('driver'),
                          json={'event': 'delivered'})
    assert r_deliv.status_code == 409

    # Port authority confirms and then resolves the incident
    inc_id = r_inc.json()['id']
    client.patch(f'/api/incidents/{inc_id}', headers=auth_header('port'), json={'status': 'confirmed'})
    client.patch(f'/api/incidents/{inc_id}', headers=auth_header('port'), json={'status': 'resolved'})

    # After hazard resolution, stopped state is cleared
    sh_after = client.get('/api/shipments/SHP-101', headers=auth_header('driver')).json()
    assert sh_after.get('hazard_stopped') is False


# ==============================================================================
# SECTION 3: SUPABASE JWT AUTHENTICATION & ROLE MAPPING WITH DEMO_MODE=FALSE
# ==============================================================================

def test_supabase_jwt_auth_and_role_mapping_live_mode(tmp_path, monkeypatch):
    """
    Verifies Supabase JWT authentication and role mapping when DEMO_MODE=false:
    - Generates cryptographic RS256 keypair
    - Configures Supabase issuer and audience settings
    - Validates valid JWT signatures and claims (sub, iss, aud, exp)
    - Verifies demo tokens ('local-port-demo') are rejected when DEMO_MODE=false
    - Verifies unmapped UUIDs and inactive accounts are rejected with 403
    - Verifies expired tokens return 401
    - Verifies role boundaries are enforced from the database mapping
    """
    # 1. Generate RSA keypair
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    supabase_issuer = 'https://mock-supabase.internal/auth/v1'
    audience = 'authenticated'

    # Configure application settings for production / non-demo mode
    monkeypatch.setattr(connection.settings, 'demo_mode', False)
    monkeypatch.setattr(connection.settings, 'supabase_url', 'https://mock-supabase.internal')
    monkeypatch.setattr(connection.settings, 'supabase_jwt_audience', audience)
    monkeypatch.setattr(connection.settings, 'mongodb_uri', '')
    monkeypatch.setattr(connection, 'path', tmp_path / 'state.json')

    # Mock DB storage
    initial_state = seed(demo=True)
    # Add explicit supabase UUIDs to users
    initial_state['users'].append({
        'id': 'driver-live-user',
        'auth_user_id': '00000000-0000-4000-8000-000000000011',
        'name': 'Live Driver',
        'role': 'driver',
        'company_id': 'LOG-101',
        'asset_id': 'TRK-101',
        'active': True
    })
    initial_state['users'].append({
        'id': 'inactive-user',
        'auth_user_id': '00000000-0000-4000-8000-000000000012',
        'name': 'Inactive Operator',
        'role': 'port',
        'port_id': 'NMP',
        'active': False
    })
    @contextmanager
    def mock_transaction():
        yield initial_state

    monkeypatch.setattr(security, 'transaction', mock_transaction)
    monkeypatch.setattr(workflow_api, 'transaction', mock_transaction)

    # Mock PyJWKClient to return the public key
    class MockSigningKey:
        def __init__(self, key):
            self.key = key

    class MockPyJWKClient:
        def __init__(self, url, **kwargs):
            pass
        def get_signing_key_from_jwt(self, token):
            return MockSigningKey(public_key)

    monkeypatch.setattr(jwt, 'PyJWKClient', MockPyJWKClient)

    def create_jwt(sub, exp_delta=timedelta(hours=1), iss=supabase_issuer, aud=audience, key=private_key):
        now = datetime.now(timezone.utc)
        payload = {
            'sub': sub,
            'iss': iss,
            'aud': aud,
            'exp': int((now + exp_delta).timestamp()),
            'iat': int(now.timestamp())
        }
        return jwt.encode(payload, key, algorithm='RS256')

    client = TestClient(app)

    # 1. Demo tokens must be REJECTED when DEMO_MODE=false
    r_demo = client.get('/api/port/dashboard', headers={'Authorization': 'Bearer local-port-demo'})
    assert r_demo.status_code == 401

    # 2. Missing authorization header returns 401
    assert client.get('/api/me').status_code == 401

    # 3. Expired JWT token returns 401
    expired_token = create_jwt('00000000-0000-4000-8000-000000000011', exp_delta=timedelta(minutes=-10))
    r_exp = client.get('/api/me', headers={'Authorization': f'Bearer {expired_token}'})
    assert r_exp.status_code == 401

    # 4. Invalid issuer returns 401
    bad_iss_token = create_jwt('00000000-0000-4000-8000-000000000011', iss='https://malicious-issuer.com/auth/v1')
    assert client.get('/api/me', headers={'Authorization': f'Bearer {bad_iss_token}'}).status_code == 401

    # 5. Invalid audience returns 401
    bad_aud_token = create_jwt('00000000-0000-4000-8000-000000000011', aud='wrong-audience')
    assert client.get('/api/me', headers={'Authorization': f'Bearer {bad_aud_token}'}).status_code == 401

    # 6. Valid signature but unmapped Supabase UUID in database returns 403
    unmapped_token = create_jwt('00000000-0000-4000-8000-000000000013')
    r_unmapped = client.get('/api/me', headers={'Authorization': f'Bearer {unmapped_token}'})
    assert r_unmapped.status_code == 403
    assert 'Active user mapping required' in r_unmapped.json()['detail']

    # 7. Inactive user returns 403
    inactive_token = create_jwt('00000000-0000-4000-8000-000000000012')
    r_inactive = client.get('/api/me', headers={'Authorization': f'Bearer {inactive_token}'})
    assert r_inactive.status_code == 403

    # 8. Valid Driver JWT returns 200 on /me and Driver dashboard
    driver_token = create_jwt('00000000-0000-4000-8000-000000000011')
    r_me = client.get('/api/me', headers={'Authorization': f'Bearer {driver_token}'})
    assert r_me.status_code == 200
    user_data = r_me.json()
    assert user_data['role'] == 'driver'
    assert user_data['id'] == 'driver-live-user'

    r_driver_dash = client.get('/api/driver/dashboard', headers={'Authorization': f'Bearer {driver_token}'})
    assert r_driver_dash.status_code == 200

    # 9. Role boundary: Driver JWT cannot access Port Operations dashboard (403)
    r_forbidden = client.get('/api/port/dashboard', headers={'Authorization': f'Bearer {driver_token}'})
    assert r_forbidden.status_code == 403
