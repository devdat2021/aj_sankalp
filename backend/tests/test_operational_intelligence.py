from copy import deepcopy
from datetime import timedelta
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import connection
from app.database.collections import seed
from app.intelligence.operational import affected, build_request, validate_solution, validate_analyst, utcnow
from app.services import operational_intelligence as service
from app.services.intelligence_external import IntegrationError


def prepared():
    state = seed()
    state['incidents'] = []  # Isolated clear-road fixture; separate tests cover hazard screening.
    t = utcnow() + timedelta(hours=1)
    sh = state['shipments'][0]
    sh.update(weight_kg=18000, pickup={'lat':12.927,'lng':74.81}, delivery={'lat':13.34,'lng':74.75},
              cargo_ready_at=t.isoformat(), pickup_window_start=t.isoformat(), pickup_window_end=(t+timedelta(hours=3)).isoformat(),
              delivery_deadline=(t+timedelta(hours=6)).isoformat(), planned_delivery_at=(t+timedelta(hours=5)).isoformat(),
              pickup_service_seconds=600, delivery_service_seconds=600)
    state['vessels'][0]['expected_arrival_at'] = t.isoformat()
    state['vehicles'][0].update(available=True, capacity_kg=20000, refrigerated=True, available_from=t.isoformat(),
        available_until=(t+timedelta(hours=8)).isoformat(), start={'lat':12.927,'lng':74.81}, cost_per_hour=400, cost_per_km=20, cost_currency='INR')
    return state


def solved(payload):
    model=payload['model']; sh=model['shipments'][0]; v=model['vehicles'][0]
    from app.intelligence.operational import dt
    t=dt(sh['pickups'][0]['timeWindows'][0]['startTime'])
    return {'routes':[{'vehicleIndex':0,'vehicleLabel':v['label'],'vehicleStartTime':t.isoformat(),
        'vehicleEndTime':(t+timedelta(hours=2)).isoformat(),'routeTotalCost':1000,
        'visits':[{'shipmentIndex':0,'isPickup':True,'startTime':t.isoformat()},
                  {'shipmentIndex':0,'startTime':(t+timedelta(hours=1)).isoformat()}]}]}


def review(context, schema=None):
    return dict(operational_summary='Review supplied evidence', root_cause_analysis='Reported operational constraints', severity='medium',
                affected_entity_ids=context['entity_ids'], cascading_consequences=[],
                recommendations=[dict(candidate_id=c['id'],evidence_ids=c['evidence_ids'],reasoning='Feasible schedule from supplied evidence') for c in context['candidates']],
                evidence_ids=[e['id'] for e in context['evidence']],assumptions_and_uncertainties=['Future conditions remain uncertain'])


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(connection.settings,'mongodb_uri','')
    monkeypatch.setattr(connection.settings,'demo_mode',True)
    monkeypatch.setattr(connection.settings,'intelligence_enabled',True)
    monkeypatch.setattr(connection,'path',tmp_path/'state.json')
    monkeypatch.setattr(service.external,'optimize',solved)
    monkeypatch.setattr(service.external,'gemini',review)
    monkeypatch.setattr(service,'forecast',lambda *args: {'source':'Open-Meteo','mode':args[2],'fetched_at':utcnow().isoformat(),'stale':False,'forecast':{}})
    with connection.transaction() as state:
        state.update(prepared())
    return TestClient(app)


def auth(role): return {'Authorization':f'Bearer local-{role}-demo'}


def analyze(client):
    r=client.post('/api/intelligence/analyses',headers=auth('logistics'),json={'shipment_id':'SHP-101'})
    assert r.status_code==202,r.text
    service.run_analysis(r.json()['id'])
    recs=client.get('/api/intelligence/recommendations',headers=auth('logistics')).json()
    return r.json(),next(r for r in recs if r['status']=='pending')


def test_dependency_closure_and_tenant_boundary():
    s=prepared(); root=s['shipments'][0]
    s['shipments'] += [dict(root,id='SIBLING',truck_id='OTHER'),dict(root,id='INDIRECT',vessel_id='OTHER',truck_id='OTHER'),dict(root,id='FOREIGN',company_id='OTHER'),dict(root,id='OTHER-PORT',port_id='OTHER')]
    assert {r['id'] for r in affected(s,root)}=={'SHP-101','SIBLING','INDIRECT'}


def test_request_constraints_missing_and_infeasible():
    state=prepared(); rows=[state['shipments'][0]]
    payload, missing, _=build_request(state,rows)
    assert payload['model']['shipments'][0]['allowedVehicleIndices']==[0]
    assert payload['model']['shipments'][0]['loadDemands']['weight_kg']['amount']=='18000'
    assert '.' not in payload['model']['globalStartTime']
    state['vehicles'][0]['refrigerated']=False
    assert build_request(state,rows)[0] is None
    state['vehicles'][0]['refrigerated']=True
    rows[0]['pickup_window_end']=rows[0]['cargo_ready_at']
    assert build_request(state,rows)[0] is None
    del rows[0]['weight_kg']
    assert build_request(state,rows)[1]


@pytest.mark.parametrize('mutation', ['unknown','duplicate','early','capacity','missing','traffic','skip'])
def test_solution_validation(mutation):
    state=prepared(); payload,_,_=build_request(state,[state['shipments'][0]])
    result=solved(payload)
    route=result['routes'][0]
    if mutation=='unknown': route['visits'][0]['shipmentIndex']=12
    if mutation=='duplicate': route['visits'].insert(1,deepcopy(route['visits'][0]))
    if mutation=='early': route['visits'][0]['startTime']='2000-01-01T00:00:00Z'
    if mutation=='capacity': payload['model']['vehicles'][0]['loadLimits']['weight_kg']['maxLoad']='1'
    if mutation=='missing': result['routes']=[]
    if mutation=='traffic': route['hasTrafficInfeasibilities']=True
    if mutation=='skip': result['skippedShipments']=[{'index':0}]
    with pytest.raises(IntegrationError): validate_solution(payload,result)


def test_gemini_hallucinations_and_schema():
    ctx={'entity_ids':['SHP-101'],'evidence':[{'id':'E1'}],'candidates':[]}
    raw=review(ctx)
    assert validate_analyst(raw,ctx)
    raw['affected_entity_ids']=['FAKE']
    with pytest.raises(ValueError): validate_analyst(raw,ctx)
    raw=review(ctx);raw['operational_summary']='Savings 987654 dollars'
    with pytest.raises(ValueError): validate_analyst(raw,ctx)
    raw=review(ctx);raw['recommendations']=[{'candidate_id':'fake','evidence_ids':['E1'],'reasoning':'do it'}]
    with pytest.raises(ValueError): validate_analyst(raw,ctx)


def test_approval_execution_notifications_and_dedup(client):
    job,rec=analyze(client)
    second=client.post('/api/intelligence/analyses',headers=auth('logistics'),json={'shipment_id':'SHP-101'}).json()
    assert second['id']==job['id']
    body={'status':'approved','reason':'Reviewed schedule'}
    path='/api/intelligence/recommendations/'+rec['id']+'/decision'
    for role in ['port','driver','captain']:
        assert client.post(path,headers=auth(role),json=body).status_code==403
    assert client.post(path,headers=auth('logistics'),json=body).status_code==200
    assert client.post(path,headers=auth('logistics'),json=body).status_code==409
    sh=client.get('/api/shipments/SHP-101',headers=auth('driver')).json()
    assert sh['planned_pickup_at']==rec['proposed_state']['assignments'][0]['planned_pickup_at']
    assert sh['status']=='at_sea'  # Approval is a schedule, not permission to pick up.
    for role in ['port','driver','captain','logistics']:
        assert any('Approved revised transport schedule' in a['message'] for a in client.get('/api/alerts',headers=auth(role)).json())


def test_stale_and_cross_company_no_mutation(client):
    _,rec=analyze(client)
    with connection.transaction() as s:
        s['vehicles'][0]['available']=False
    r=client.post('/api/intelligence/recommendations/'+rec['id']+'/decision',headers=auth('logistics'),json={'status':'approved','reason':'Review'})
    assert r.status_code==409
    with connection.transaction() as s:
        assert s['recommendations'][0]['status']=='pending'
        assert not s['shipments'][0].get('recovery_recommendation_id')
        s['shipments'][0]['company_id']='FOREIGN'
    assert client.get('/api/intelligence/recommendations',headers=auth('logistics')).json()==[]


def test_external_failures_no_fake_plan(client,monkeypatch):
    def fail(*args): raise IntegrationError('HTTP 403 billing unavailable')
    monkeypatch.setattr(service.external,'optimize',fail)
    monkeypatch.setattr(service.external,'gemini',fail)
    r=client.post('/api/intelligence/analyses',headers=auth('logistics'),json={'shipment_id':'SHP-101'})
    service.run_analysis(r.json()['id'])
    job=client.get('/api/intelligence/analyses',headers=auth('logistics')).json()[0]
    assert job['status']=='degraded'
    assert job['integrations']['google']['status']=='unavailable'
    assert client.get('/api/intelligence/recommendations',headers=auth('logistics')).json()==[]


def test_gemini_unavailable_keeps_ai_output_empty_and_marks_analysis_degraded(client,monkeypatch):
    def fail(*args):
        raise IntegrationError('Gemini: HTTP 503; UNAVAILABLE')
    monkeypatch.setattr(service.external,'gemini',fail)
    post=client.post('/api/intelligence/analyses',headers=auth('logistics'),json={'shipment_id':'SHP-101'})
    service.run_analysis(post.json()['id'])
    job=client.get('/api/intelligence/analyses',headers=auth('logistics')).json()[0]
    assert job['status']=='degraded'
    assert job['analyst'] is None
    assert job['integrations']['gemini']['status']=='unavailable'
    recommendation=next(r for r in client.get('/api/intelligence/recommendations',headers=auth('logistics')).json()
                        if r['analysis_id']==job['id'])
    assert recommendation['status']=='pending'
    assert 'Gemini unavailable' in recommendation['source']


def test_gemini_503_is_not_retried_and_same_retirement_fallback_is_not_called(monkeypatch):
    settings=service.external.settings
    monkeypatch.setattr(settings,'gemini_api_key','test-only-key')
    monkeypatch.setattr(settings,'gemini_model','gemini-3.8-flash')
    monkeypatch.setattr(settings,'gemini_retired_model_fallback','gemini-3.8-flash')
    monkeypatch.setattr(service.external,'_resolved_models',{})
    calls=[]

    def unavailable(url,**kwargs):
        calls.append(url)
        return httpx.Response(503,json={'error':{'status':'UNAVAILABLE'}},request=httpx.Request('POST',url))

    monkeypatch.setattr(service.external.httpx,'post',unavailable)
    with pytest.raises(IntegrationError,match='HTTP 503; UNAVAILABLE'):
        service.external.gemini({'purpose':'test'}, {'type':'object'})
    assert len(calls)==1


def test_input_ownership_and_automatic_trigger(client):
    assert client.patch('/api/intelligence/shipments/SHP-101/inputs',headers=auth('logistics'),json={'cargo_ready_at':utcnow().isoformat()}).status_code==403
    r=client.patch('/api/vessels/VES-101/eta',headers=auth('captain'),json={'eta_hours':2})
    assert r.status_code==200
    assert r.json()['expected_arrival_at']
    assert client.get('/api/intelligence/analyses',headers=auth('logistics')).json()[0]['trigger']=='vessel_eta_changed'


def test_road_disruption_automatically_queues_scoped_analysis(client):
    report=client.post('/api/incidents',headers=auth('driver'),json={
        'shipment_id':'SHP-101','category':'roadblock','severity':'high',
        'description':'Road closure reported by the assigned driver.',
        'lat':13.09,'lng':74.79,
    })
    assert report.status_code==201
    jobs=client.get('/api/intelligence/analyses',headers=auth('logistics')).json()
    incident_jobs=[j for j in jobs if j['trigger']=='incident:'+report.json()['id']]
    assert any('SHP-101' in job['shipment_ids'] for job in incident_jobs)


def test_fleet_input_change_queues_all_active_company_shipments(client):
    with connection.transaction() as state:
        root=state['shipments'][0]
        state['shipments'].extend([
            dict(root,id='SHP-102',truck_id='TRK-102',vessel_id='VES-102'),
            dict(root,id='SHP-FOREIGN',company_id='OTHER',truck_id='TRK-OTHER',vessel_id='VES-OTHER'),
            dict(root,id='SHP-DELIVERED',status='delivered',truck_id='TRK-DELIVERED',vessel_id='VES-DELIVERED'),
        ])
    start=utcnow()+timedelta(minutes=5)
    response=client.patch('/api/intelligence/vehicles/TRK-101/inputs',headers=auth('logistics'),json={
        'available':True,'capacity_kg':20000,'refrigerated':True,
        'available_from':start.isoformat(),'available_until':(start+timedelta(hours=8)).isoformat(),
        'cost_per_hour':400,'cost_per_km':20,'cost_currency':'INR','start':{'lat':12.927,'lng':74.81},
    })
    assert response.status_code==200,response.text
    jobs=client.get('/api/intelligence/analyses',headers=auth('logistics')).json()
    shipment_ids={sid for job in jobs if job['trigger']=='vehicle_availability' for sid in job['shipment_ids']}
    assert {'SHP-101','SHP-102'} <= shipment_ids
    assert 'SHP-FOREIGN' not in shipment_ids
    assert 'SHP-DELIVERED' not in shipment_ids


def test_queued_snapshot_stale_before_paid_calls(client,monkeypatch):
    job=client.post('/api/intelligence/analyses',headers=auth('logistics'),json={'shipment_id':'SHP-101'}).json()
    with connection.transaction() as s: s['port']['status']='closed'
    def fail(*args): pytest.fail('Stale analysis must not call paid service')
    monkeypatch.setattr(service.external,'optimize',fail)
    service.run_analysis(job['id'])
    assert client.get('/api/intelligence/analyses',headers=auth('logistics')).json()[0]['status']=='stale'


def test_dispatch_hold_is_actionable_without_external_service(client,monkeypatch):
    def fail(*args): raise IntegrationError('Unavailable')
    monkeypatch.setattr(service.external,'optimize',fail)
    monkeypatch.setattr(service.external,'gemini',fail)
    with connection.transaction() as state:
        state['shipments'][0]['planned_pickup_at']=utcnow().isoformat()
    _,rec=analyze(client)
    assert rec['action']=='hold_dispatch'
    result=client.post('/api/intelligence/recommendations/'+rec['id']+'/decision',headers=auth('logistics'),json={'status':'approved','reason':'Wait for delayed vessel'})
    assert result.status_code==200,result.text
    assert result.json()['status']=='executed'
    sh=client.get('/api/shipments/SHP-101',headers=auth('driver')).json()
    assert sh['dispatch_not_before']
    assert sh['status']=='at_sea'
    assert any('Approved dispatch hold' in a['message'] for a in client.get('/api/alerts',headers=auth('driver')).json())


def test_road_hazards_make_google_plan_advisory(client):
    with connection.transaction() as state:
        state['incidents']=seed()['incidents']
    r=client.post('/api/intelligence/analyses',headers=auth('logistics'),json={'shipment_id':'SHP-101'})
    service.run_analysis(r.json()['id'])
    rec=client.get('/api/intelligence/recommendations',headers=auth('logistics')).json()[0]
    assert rec['advisory']
    assert 'Route geometry unavailable' in rec['reason']
