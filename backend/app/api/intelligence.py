from fastapi import APIRouter, Depends, HTTPException
from app.core.config import settings
from app.core.security import current_user
from app.database.connection import transaction
from app.schemas.intelligence import AnalysisRequest, RecoveryDecision, ShipmentInputs, VehicleInputs
from app.services.operational_intelligence import enqueue, trigger, decide
from app.services.workflow import require, shipment, visible
from app.services.port_service import audit
from app.services.intelligence_external import effective_gemini_model
from app.intelligence.operational import dt, utcnow, fingerprint

router = APIRouter(prefix='/api/intelligence', tags=['Operational intelligence'])


@router.get('/health')
def health(user=Depends(current_user)):
    return dict(enabled=settings.intelligence_enabled, storage='MongoDB' if settings.mongodb_uri else 'local demo JSON',
                google_configured=bool(settings.google_cloud_project and settings.optimization_enabled),
                gemini_configured=bool(settings.gemini_api_key), gemini_model=settings.gemini_model,
                gemini_effective_model=effective_gemini_model(),
                verification='See integration status on the latest analysis; configuration is not a successful API check',
                cache_seconds=settings.intelligence_cache_seconds)


@router.post('/analyses', status_code=202)
def analyze(body: AnalysisRequest, user=Depends(current_user)):
    require(user, 'port', 'logistics', 'captain')
    if not settings.intelligence_enabled:
        raise HTTPException(503, 'Operational intelligence disabled')
    with transaction() as state:
        root = shipment(state, user, body.shipment_id)
        # Captains may report vessel events; company-wide paid manual planning belongs to operators.
        require(user, 'port', 'logistics')
        return enqueue(state, root, 'manual', user['id'], retry=body.retry)


def job_visible(user, job):
    return ((user['role']=='port' and job['port_id']==user.get('port_id')) or
            (user['role']=='logistics' and job['company_id']==user.get('company_id')))


@router.get('/analyses')
def analyses(user=Depends(current_user)):
    with transaction() as state:
        return [j for j in reversed(state['intelligence_jobs']) if job_visible(user,j)][:30]


@router.get('/recommendations')
def recommendations(user=Depends(current_user)):
    with transaction() as state:
        current_fingerprint = fingerprint(state)
        ids = {s['id'] for s in state['shipments'] if visible(user,s)}
        output = []
        for r in reversed(state['recommendations']):
            r = dict(r)
            if r['status'] == 'pending':
                if dt(r['expires_at']) <= utcnow():
                    r.update(status='expired', unavailable_reason='This proposal expired. Analyze the current plan again.')
                elif r['fingerprint'] != current_fingerprint:
                    r.update(status='stale', unavailable_reason='Operations changed. Analyze the current plan again.')
            overlap = set(r['shipment_ids']) & ids
            if not overlap:
                continue
            if user['role'] == 'driver' and r['status'] != 'executed':
                continue
            if not set(r['shipment_ids']) <= ids:
                # Captains/drivers see only their consignments, never a multi-asset plan's other cargo.
                projected = {k:r[k] for k in ('id','status','action','responsible_role','advisory','source','created_at','expires_at','reason')}
                projected['shipment_ids']=sorted(overlap)
                projected['proposed_state']={'assignments':[a for a in (r.get('proposed_state') or {}).get('assignments',[]) if a['shipment_id'] in overlap]}
                projected['impact']=[a for a in r.get('impact') or [] if a['shipment_id'] in overlap]
                output.append(projected)
            else:
                output.append(r)
        return output[:50]


@router.post('/recommendations/{id}/decision')
def decision(id: str, body: RecoveryDecision, user=Depends(current_user)):
    with transaction() as state:
        rec = next((r for r in state['recommendations'] if r['id']==id), None)
        if not rec:
            raise HTTPException(404, 'Recommendation not found')
        return decide(state, user, rec, body)


@router.patch('/shipments/{id}/inputs')
def shipment_inputs(id: str, body: ShipmentInputs, user=Depends(current_user)):
    require(user, 'logistics', 'port')
    updates = body.model_dump(mode='json', exclude_unset=True)
    port_fields = {'cargo_ready_at', 'pickup_window_start', 'pickup_window_end', 'pickup_service_seconds'}
    if (user['role']=='logistics' and port_fields & updates.keys()) or (user['role']=='port' and updates.keys()-port_fields):
        raise HTTPException(403, 'Port owns cargo readiness/pickup windows; logistics owns transport inputs')
    with transaction() as state:
        row = shipment(state,user,id)
        row.update(updates)
        audit(state,user,'intelligence_inputs_updated',id)
        trigger(state,[row],'operational_inputs',user['id'])
        return row


@router.patch('/vehicles/{id}/inputs')
def vehicle_inputs(id: str, body: VehicleInputs, user=Depends(current_user)):
    require(user, 'logistics')
    with transaction() as state:
        row = next((v for v in state['vehicles'] if v['id']==id and v.get('company_id')==user.get('company_id')),None)
        if not row:
            raise HTTPException(404,'Vehicle not found')
        row.update(body.model_dump(mode='json'))
        audit(state,user,'vehicle_availability_updated',id)
        trigger(state,[s for s in state['shipments'] if s.get('company_id')==user.get('company_id') and s.get('status')!='delivered'],
                'vehicle_availability',user['id'])
        return row
