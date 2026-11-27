"""Durable bounded queue and approval workflow using the existing operational store."""
from copy import deepcopy
from datetime import timedelta
from threading import Event, Thread
from uuid import uuid4
from fastapi import HTTPException
from app.core.config import settings
from app.database.connection import transaction
from app.intelligence.operational import (affected, assess, build_request, comparison, domain_blocks,
    dt, fingerprint, utcnow, validate_analyst, validate_solution, weather_evidence, plan_hazards)
from app.schemas.intelligence import AnalystReview
from app.services import intelligence_external as external
from app.services.port_service import audit, now
from app.services.weather import forecast
from app.services.workflow import notify, shipment, supersede_routes, visible


def enqueue(state, root, trigger, actor_id=None, retry=False):
    if not settings.intelligence_enabled:
        return None
    fp = fingerprint(state)
    cutoff = utcnow() - timedelta(seconds=settings.intelligence_cache_seconds)
    ids = sorted(s['id'] for s in affected(state, root))
    for job in reversed(state['intelligence_jobs']):
        if job['shipment_ids'] == ids and job['fingerprint'] == fp and dt(job['created_at']) > cutoff:
            if not retry or job['status'] in {'queued','running'}:
                return job
            if dt(job.get('completed_at',job['created_at'])) > utcnow()-timedelta(seconds=60):
                raise HTTPException(429,'Wait at least one minute before explicitly repeating paid analysis')
            break
    for job in state['intelligence_jobs']:
        if job['shipment_ids'] == ids and job['status'] == 'queued':
            job.update(status='superseded', completed_at=now())
    if sum(j['status'] in {'queued', 'running'} for j in state['intelligence_jobs']) >= 20:
        raise HTTPException(429, 'Intelligence queue is full; retry later')
    job = dict(id=str(uuid4()), shipment_ids=ids, root_id=root['id'], company_id=root['company_id'],
               port_id=root['port_id'], fingerprint=fp, trigger=trigger, actor_id=actor_id,
               created_at=now(), status='queued', integrations={}, missing_inputs=[])
    state['intelligence_jobs'].append(job)
    return job


def trigger(state, rows, reason, actor_id=None):
    """One analysis per connected company group; never fail the original operational update."""
    done = set()
    for row in rows:
        if row['id'] in done or row['status'] == 'delivered':
            continue
        try:
            job = enqueue(state, row, reason, actor_id)
            if job:
                done.update(job['shipment_ids'])
        except HTTPException:
            # Visible event makes bounded-queue backpressure explicit.
            state['events'].append(dict(id=str(uuid4()), event='intelligence_deferred', shipment_id=row['id'], created_at=now(), reason='Queue full; manual analysis required'))
            break


def run_analysis(job_id):
    with transaction() as state:
        job = next(j for j in state['intelligence_jobs'] if j['id'] == job_id)
        if job['status'] != 'queued':
            return
        if fingerprint(state) != job['fingerprint']:
            job.update(status='stale', completed_at=now())
            return
        job.update(status='running', started_at=now())
        snapshot, job_copy = deepcopy(state), deepcopy(job)
    # No external requests while holding a database transaction.
    try:
        result, recs = analyze(snapshot, job_copy)
    except Exception as exc:
        result, recs = dict(status='failed', error=f'Analysis failed ({type(exc).__name__}); no operational changes applied'), []
    with transaction() as state:
        job = next(j for j in state['intelligence_jobs'] if j['id'] == job_id)
        if fingerprint(state) != job['fingerprint']:
            job.update(status='stale', completed_at=now())
            return
        job.update(result, completed_at=now())
        state['recommendations'].extend(recs)


def analyze(state, job):
    rows = [s for s in state['shipments'] if s['id'] in job['shipment_ids']]
    evidence = assess(state, rows)
    payload, missing, fleet = build_request(state, rows)
    integrations, candidates, plans, skipped = {}, [], [], []
    weather = []
    for mode in ('land', 'marine'):
        try:
            weather.append(forecast(state['port']['lat'], state['port']['lng'], mode))
        except (HTTPException, KeyError):
            missing.append(f'{mode} weather unavailable')
    for item in weather:
        evidence.append(dict(id=f'E{len(evidence)+1}', kind='weather_forecast', entity_ids=[state['port']['id']],
                             details={'source': item['source'], 'mode': item['mode'], 'fetched_at': item['fetched_at'], 'stale': item['stale'],
                                      'uncertainty': 'Forecast only; not a confirmed disruption', **weather_evidence(item)}))
    if payload:
        try:
            cached=next((j for j in reversed(state['intelligence_jobs']) if j['id']!=job['id'] and j['fingerprint']==job['fingerprint'] and j.get('integrations',{}).get('google',{}).get('status')=='verified' and dt(j.get('completed_at',j['created_at']))>utcnow()-timedelta(seconds=settings.intelligence_cache_seconds)),None)
            cached_plans=[e['details'] for e in (cached or {}).get('evidence',[]) if e['kind']=='validated_optimization']
            if cached_plans and all(dt(a['planned_dispatch_at'])>utcnow() for p in cached_plans for a in p['assignments']):
                plans, skipped = cached_plans, cached.get('unassigned_shipments',[])
                integrations['google']=cached['integrations']['google'] | {'cached':True}
            else:
                response = external.optimize(payload)
                plans, skipped = validate_solution(payload, response)
                integrations['google'] = dict(status='verified', source='Google Route Optimization', checked_at=now())
        except external.IntegrationError as exc:
            integrations['google'] = dict(status='unavailable', error=str(exc), checked_at=now())
    else:
        integrations['google'] = dict(status='not_called', reason='Insufficient or infeasible operational inputs')
    for plan in plans:
        hazards = plan_hazards(state,plan,rows)
        eid = f'E{len(evidence)+1}'
        evidence.append(dict(id=eid, kind='validated_optimization', entity_ids=[a['shipment_id'] for a in plan['assignments']], details=plan))
        candidates.append(dict(id=str(uuid4()), action='schedule_transport', responsible_role='logistics',
            company_id=job['company_id'], shipment_ids=[a['shipment_id'] for a in plan['assignments']],
            proposed_state=plan, evidence_ids=[eid], impact=comparison(rows, plan['assignments']), source_kind='google',
            advisory=bool(hazards), reason=('Route requires existing OSRM alternative / logistics reroute review: '+ '; '.join(hazards)) if hazards else 'Validated transport schedule; port access and physical pickup remain subject to existing approvals.'))
    # Domain problems remain advisory; no fabricated alternative vehicles or time estimates.
    for e in evidence:
        if e['kind'] == 'domain_constraint' or (e['kind'] == 'cold_chain' and e['details']['exceedance_c'] > 0):
            candidates.append(dict(id=str(uuid4()), action='review_constraint', responsible_role='port', company_id=job['company_id'],
                shipment_ids=[x for x in e['entity_ids'] if x in job['shipment_ids']], proposed_state=None,
                evidence_ids=[e['id']], impact=None, advisory=True, reason=str(e['details'])))
    for sh in rows:
        vessel=next((v for v in state['vessels'] if v['id']==sh.get('vessel_id')), {})
        ready=[dt(v) for v in (sh.get('cargo_ready_at'),vessel.get('expected_arrival_at')) if v]
        if sh.get('truck_id') and sh.get('planned_pickup_at') and ready and sh['status'] not in {'in_transit','delivered'}:
            hold_until=max(ready)
            if hold_until>utcnow() and dt(sh['planned_pickup_at'])<hold_until and (not sh.get('dispatch_not_before') or dt(sh['dispatch_not_before'])<hold_until):
                candidates.append(dict(id=str(uuid4()),action='hold_dispatch',responsible_role='logistics',company_id=job['company_id'],
                    shipment_ids=[sh['id']],proposed_state={'truck_id':sh['truck_id'],'assignments':[{'shipment_id':sh['id'],'truck_id':sh['truck_id'],'dispatch_not_before':hold_until.isoformat()}]},
                    evidence_ids=[e['id'] for e in evidence if sh['id'] in e['entity_ids'] and e['kind'] in {'operational_state','vessel_arrival','vessel_pickup_dependency'}],
                    impact=[], advisory=False, source_kind='deterministic',
                    reason='Hold truck dispatch until reported vessel arrival and cargo readiness. This is a lower bound, not clearance to dispatch or a predicted delivery time.',
                    calculations={'pickup_readiness_gap_seconds':(hold_until-dt(sh['planned_pickup_at'])).total_seconds()}))
    entities = set(job['shipment_ids']) | {job['company_id'], job['port_id']}
    entities.update(s[k] for s in rows for k in ('vessel_id', 'truck_id') if s.get(k))
    entities.update(v['id'] for v in fleet)
    entities.update(i for e in evidence for i in e['entity_ids'])
    context = dict(entity_ids=sorted(entities), evidence=evidence, candidates=candidates, missing_inputs=missing,
        weather=weather, fleet=[{k: v.get(k) for k in ('id','available','capacity_kg','refrigerated','available_from','available_until')} for v in fleet],
        shipments=rows, trigger=job['trigger'], unassigned_shipments=skipped,
        constraints=['No domain capacity is reserved by optimization', 'Existing OSRM routes and incident approval workflows remain authoritative for road hazards',
                     'No operational risk probability, financial savings or spoilage estimate can be inferred from missing inputs'])
    analyst = None
    try:
        analyst = validate_analyst(external.gemini(context, AnalystReview.model_json_schema()), context)
        integrations['gemini'] = dict(status='verified', checked_at=now(), configured_model=settings.gemini_model, effective_model=external.effective_gemini_model())
    except (external.IntegrationError, ValueError) as exc:
        integrations['gemini'] = dict(status='unavailable', error=str(exc) if isinstance(exc, external.IntegrationError) else 'Structured analyst response failed grounding validation', checked_at=now(), configured_model=settings.gemini_model, effective_model=external.effective_gemini_model())
    recs = []
    for candidate in candidates:
        related = [s for s in rows if s['id'] in candidate['shipment_ids']]
        recs.append(candidate | dict(analysis_id=job['id'], created_at=now(), expires_at=(utcnow()+timedelta(seconds=settings.intelligence_cache_seconds)).isoformat(),
            fingerprint=job['fingerprint'], current_state=[{k: s.get(k) for k in ('id','truck_id','status','planned_dispatch_at','planned_pickup_at','planned_delivery_at','dispatch_not_before')} for s in related],
            priority='high' if any(s.get('requires_cold') for s in related) or candidate['action']=='hold_dispatch' else 'normal',
            status='advisory' if candidate['advisory'] else 'pending', decisions=[],
            source=('Google Route Optimization + domain screening'+ (' + validated Gemini review' if analyst else '; Gemini unavailable')) if candidate.get('source_kind')=='google' else 'deterministic operational calculation',
            evidence=[e for e in evidence if e['id'] in candidate['evidence_ids']], port_id=job['port_id']))
    return dict(status='completed' if analyst and integrations['google']['status']=='verified' else 'degraded',
                integrations=integrations, evidence=evidence, analyst=analyst, missing_inputs=missing,
                affected_entities=sorted(entities), unassigned_shipments=skipped,
                comparison=[c for r in recs for c in (r.get('impact') or [])]), recs


def decide(state, user, rec, decision):
    if rec['responsible_role'] != user['role']:
        raise HTTPException(403, 'Recommendation belongs to another decision owner')
    rows = [shipment(state, user, sid) for sid in rec['shipment_ids']]
    if rec['status'] != 'pending' or rec['advisory']:
        raise HTTPException(409, 'Recommendation is advisory or already decided')
    if decision.status == 'approved':
        if dt(rec['expires_at']) < utcnow() or rec['fingerprint'] != fingerprint(state):
            raise HTTPException(409, 'Recommendation is stale; run a new analysis')
        plan = rec['proposed_state']
        if rec['action']=='hold_dispatch':
            sh=rows[0]; assignment=plan['assignments'][0]
            vehicle=next((v for v in state['vehicles'] if v['id']==assignment['truck_id'] and v.get('company_id')==user.get('company_id')),None)
            if not vehicle or sh.get('truck_id')!=vehicle['id'] or sh['status'] in {'in_transit','delivered'} or dt(assignment['dispatch_not_before'])<=utcnow():
                raise HTTPException(409,'Hold is stale or truck ownership/assignment changed')
            sh['dispatch_not_before']=assignment['dispatch_not_before']
            sh['dispatch_hold_recommendation_id']=rec['id']
            sh.setdefault('events',[]).append(dict(id=str(uuid4()),event='dispatch_hold_approved',created_at=now(),actor=user['id'],recommendation_id=rec['id']))
            notify(state,'Approved dispatch hold for '+sh['id']+' until '+assignment['dispatch_not_before']+'. Vessel/cargo readiness delayed; dispatch still requires operational clearance.',rows,event_key=rec['id']+':approved')
            rec['status']='executed'
            rec['decisions'].append(dict(actor=user['id'],status='approved',reason=decision.reason,created_at=now()))
            audit(state,user,'recovery_executed',rec['id'])
            return rec
        if plan_hazards(state,plan,rows):
            raise HTTPException(409, 'Current road hazards require the existing route approval workflow')
        payload, missing, _ = build_request(state, rows)
        if not payload:
            raise HTTPException(409, 'Current fleet or cargo constraints no longer permit this plan')
        vehicle = next((v for v in state['vehicles'] if v['id'] == plan['truck_id']), None)
        if not vehicle or vehicle['company_id'] != user.get('company_id') or not vehicle.get('available') or vehicle.get('hazard_stopped'):
            raise HTTPException(409, 'Truck unavailable or not owned')
        driver = next((u for u in state['users'] if u['id'] == vehicle.get('driver_id') and u.get('active') and u.get('role') == 'driver' and u.get('asset_id') == vehicle['id'] and u.get('company_id') == user.get('company_id')), None)
        if not driver:
            raise HTTPException(409, 'Truck requires an active, correctly scoped driver')
        for a in plan['assignments']:
            sh = next(s for s in rows if s['id'] == a['shipment_id'])
            if domain_blocks(state, sh) or dt(a['planned_dispatch_at']) < utcnow():
                raise HTTPException(409, 'Plan is no longer executable; run a fresh analysis')
            if sh.get('truck_id') != a['truck_id']:
                supersede_routes(state, sh, 'Recovery assignment changed; validate a route for the assigned truck')
                sh['assignment_version'] = sh.get('assignment_version', 0) + 1
                for access in state['port_requests']:
                    if access.get('shipment_id') == sh['id'] and access.get('kind') in {'truck_access', 'slot_revision'} and access['status'] == 'approved':
                        access['status'] = 'revoked'
            sh.update({k: v for k, v in a.items() if k != 'shipment_id'})
            sh['recovery_recommendation_id'] = rec['id']
            sh.setdefault('events', []).append(dict(id=str(uuid4()), event='recovery_schedule_approved', created_at=now(), actor=user['id'], recommendation_id=rec['id']))
        vehicle['reserved_recommendation_id'] = rec['id']
        # Notify only after all constraints pass; transaction rolls back everything on any error.
        notify(state, 'Approved revised transport schedule: ' + ', '.join(rec['shipment_ids']) + '. Check revised pickup instructions; existing port access rules still apply.', rows, event_key=rec['id']+':approved')
    rec['status'] = 'executed' if decision.status == 'approved' else 'rejected'
    rec['decisions'].append(dict(actor=user['id'], status=decision.status, reason=decision.reason, created_at=now()))
    audit(state, user, 'recovery_'+rec['status'], rec['id'])
    return rec


def worker(stop):
    last_deadline_scan = utcnow()
    while not stop.wait(2):
        try:
            with transaction() as state:
                if utcnow()-last_deadline_scan > timedelta(minutes=1):
                    vulnerable = [s for s in state['shipments'] if s.get('delivery_deadline') and s['status'] != 'delivered' and dt(s['delivery_deadline']) <= utcnow()+timedelta(hours=1)]
                    trigger(state, vulnerable, 'deadline_exposure')
                    last_deadline_scan = utcnow()
                # Interrupted calls are never retried automatically because they may have been billed.
                for j in state['intelligence_jobs']:
                    if j['status'] == 'running' and dt(j['started_at']) < utcnow()-timedelta(minutes=5):
                        j.update(status='failed', error='Worker interrupted or timed out; explicit new analysis required')
                job = next((j for j in state['intelligence_jobs'] if j['status'] == 'queued'), None)
                jid = job['id'] if job else None
            if jid:
                run_analysis(jid)
        except Exception:
            # No secrets or incident text in background logs. Next cycle can process other work.
            continue


def start_worker():
    stop = Event()
    thread = Thread(target=worker, args=(stop,), daemon=True, name='operational-intelligence')
    if settings.intelligence_enabled:
        thread.start()
    return stop
