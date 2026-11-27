"""Real operational smoke test. No mocked APIs, no credential logging.

--inspect is read-only. --demo prepares explicitly labelled inputs on the existing
SHP-101/TRK-101/VES-101 demo records, reports a delay, analyzes and approves a schedule.
The resulting records and audit history are retained for portal demonstration.
"""
import sys
from datetime import timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.database.connection import transaction
from app.intelligence.operational import utcnow
from app.services.operational_intelligence import run_analysis
from app.intelligence.operational import build_request, affected
from app.services.intelligence_external import optimize


def main():
    if '--model' in sys.argv:
        settings.gemini_model=sys.argv[sys.argv.index('--model')+1]
    with transaction() as s:
        print('Storage:', 'MongoDB' if settings.mongodb_uri else 'local demo JSON')
        print('Operational counts:', {k:len(s[k]) for k in ('shipments','vessels','vehicles','users')})
        print('Demo records:', [{k:r.get(k) for k in ('id','status','company_id','truck_id','vessel_id')} for r in s['shipments'] if r['id']=='SHP-101'])
        print('Persisted dispatch holds:',[{k:r.get(k) for k in ('id','dispatch_not_before','dispatch_hold_recommendation_id')} for r in s['shipments'] if r.get('dispatch_hold_recommendation_id')])
        approved_ids={r['id'] for r in s['recommendations'] if r['status']=='executed'}
        recovery_alerts=[a for a in s['alerts'] if a.get('event_key') in {rid+':approved' for rid in approved_ids}]
        print('Recovery notification recipient roles:',sorted({u['role'] for u in s['users'] if any(u['id'] in a['recipient_ids'] for a in recovery_alerts)}))
        snapshot = s
    if '--diagnostics' in sys.argv:
        print('Recent jobs:',[{k:j.get(k) for k in ('id','root_id','status','trigger','created_at','integrations','missing_inputs','error')} for j in snapshot['intelligence_jobs'][-5:]])
        print('Worker queue:',{status:sum(j['status']==status for j in snapshot['intelligence_jobs']) for status in ('queued','running','failed','stale','degraded','completed')})
        return
    if '--validate-current' in sys.argv:
        root=next(s for s in snapshot['shipments'] if s['id']=='SHP-101')
        payload,missing,_=build_request(snapshot,affected(snapshot,root))
        if not payload:
            print('Missing:',missing); return
        payload['solvingMode']='VALIDATE_ONLY'
        print('Validation:',optimize(payload).get('validationErrors','OK'))
        return
    if '--analyze-current' in sys.argv:
        client=TestClient(app)
        headers={'Authorization':'Bearer local-logistics-demo'}
        response=client.post('/api/intelligence/analyses',headers=headers,json={'shipment_id':'SHP-101','retry':True})
        if response.status_code!=202: raise RuntimeError('Analysis request rejected: '+str(response.status_code))
        jid=response.json()['id']; run_analysis(jid)
        job=next(j for j in client.get('/api/intelligence/analyses',headers=headers).json() if j['id']==jid)
        print('Analysis:',job['status'],job.get('integrations'))
        print('Missing inputs:',job.get('missing_inputs'))
        print('Comparison:',job.get('comparison'))
        recs=[r for r in client.get('/api/intelligence/recommendations',headers=headers).json() if r['analysis_id']==jid]
        print('Recommendations:',[{k:r.get(k) for k in ('id','status','reason')} for r in recs])
        if '--approve' in sys.argv:
            for rec in recs:
                if rec['status']!='pending': continue
                decision=client.post('/api/intelligence/recommendations/'+rec['id']+'/decision',headers=headers,json={'status':'approved','reason':'Explicit live acceptance scenario: reviewed feasible schedule'})
                print('Approval HTTP:',decision.status_code,'status:',decision.json().get('status',decision.json().get('detail')))
            with transaction() as state:
                print('Recovery notifications:',sum(bool(a.get('event_key')) and any(a['event_key']==r['id']+':approved' for r in recs) for a in state['alerts']))
            for role in ('port','logistics','captain','driver'):
                alerts=client.get('/api/alerts',headers={'Authorization':f'Bearer local-{role}-demo'}).json()
                print(role,'received approved recovery instruction:',any('Approved dispatch hold' in a['message'] or 'Approved revised transport schedule' in a['message'] for a in alerts))
        return
    if '--demo' not in sys.argv:
        return
    if not settings.demo_mode or not settings.mongodb_uri:
        raise RuntimeError('Real demo requires DEMO_MODE=true and configured MongoDB')
    client=TestClient(app)  # Explicit synchronous job execution; no background polling during setup.
    def call(method,path,role,body=None):
        r=client.request(method,'/api'+path,headers={'Authorization':f'Bearer local-{role}-demo'},json=body)
        if r.status_code>=400:
            # API errors are curated; never print raw transport/credential exceptions.
            raise RuntimeError(f'{method} {path}: HTTP {r.status_code}; {r.json().get("detail")}')
        return r.json()
    sh=call('GET','/shipments/SHP-101','logistics')
    if sh['status'] not in {'planned','at_sea','arrived','at_port','unloaded','ready_for_pickup'} or sh.get('hazard_stopped'):
        raise RuntimeError('Existing demo shipment is not eligible; no state reset was performed')
    t=utcnow()+timedelta(hours=2)
    call('PATCH','/intelligence/shipments/SHP-101/inputs','logistics',dict(
        weight_kg=18000,pickup={'lat':12.927,'lng':74.81},delivery={'lat':13.3409,'lng':74.7421},
        delivery_deadline=(t+timedelta(hours=6)).isoformat(),delivery_service_seconds=600,
        planned_pickup_at=(t-timedelta(hours=1)).isoformat(),planned_delivery_at=(t+timedelta(hours=5)).isoformat()))
    call('PATCH','/intelligence/shipments/SHP-101/inputs','port',dict(
        cargo_ready_at=t.isoformat(),pickup_window_start=t.isoformat(),pickup_window_end=(t+timedelta(hours=3)).isoformat(),pickup_service_seconds=600))
    call('PATCH','/intelligence/vehicles/TRK-101/inputs','logistics',dict(available=True,capacity_kg=20000,refrigerated=True,
        available_from=t.isoformat(),available_until=(t+timedelta(hours=8)).isoformat(),start={'lat':12.927,'lng':74.81},cost_per_hour=400,cost_per_km=20,cost_currency='INR'))
    with transaction() as s:
        row=next(r for r in s['shipments'] if r['id']=='SHP-101')
        row['intelligence_scenario']='Explicit demonstration inputs; not measured operational performance'
    call('PATCH','/vessels/VES-101/eta','captain',{'eta_hours':2})
    job=call('POST','/intelligence/analyses','logistics',{'shipment_id':'SHP-101'})
    run_analysis(job['id'])
    latest=next(j for j in call('GET','/intelligence/analyses','logistics') if j['id']==job['id'])
    print('Analysis:',latest['status'],latest.get('integrations'), 'missing:',latest.get('missing_inputs'))
    recs=[r for r in call('GET','/intelligence/recommendations','logistics') if r['analysis_id']==job['id'] and not r['advisory']]
    if not recs:
        raise RuntimeError('No validated executable recommendation; nothing approved')
    for rec in recs:
        result=call('POST','/intelligence/recommendations/'+rec['id']+'/decision','logistics',{'status':'approved','reason':'Explicit live integration demonstration: validated schedule and capacity reviewed'})
        print('Recommendation:',result['id'],result['status'])
        break  # Any operational approval invalidates sibling snapshots by design.
    driver=call('GET','/shipments/SHP-101','driver')
    print('Persisted dispatch hold:',driver.get('dispatch_not_before'),'pickup:',driver.get('planned_pickup_at'),'delivery:',driver.get('planned_delivery_at'))
    for role in ('port','logistics','captain','driver'):
        alerts=call('GET','/alerts',role)
        print(role,'received recovery notification:',any('Approved revised transport schedule' in a['message'] or 'Approved dispatch hold' in a['message'] for a in alerts))
    print('Comparison:',latest.get('comparison'))


if __name__=='__main__':
    try:
        main()
    except Exception as exc:
        if isinstance(exc,RuntimeError): print(str(exc))
        else: print('Operational verification failed:',type(exc).__name__)
        sys.exit(1)
