from fastapi import APIRouter, Depends, HTTPException
from app.core.security import authority
from app.core.config import settings
from app.database.connection import transaction
from app.schemas.port import Review, Decision, Alert, Scenario, Incident
from app.services.port_service import find, alert, audit, now
from app.intelligence.simulation.engine import simulate
from uuid import uuid4
router=APIRouter(prefix='/api')
@router.get('/health')
def health():
    with transaction() as s: pass
    return {'status':'ok','demo_mode':settings.demo_mode,'storage':'MongoDB' if settings.mongodb_uri else 'local JSON'}
@router.get('/me')
def me(user=Depends(authority)): return user
@router.get('/port/dashboard')
def dashboard(user=Depends(authority)):
    with transaction() as s: return {k:v for k,v in s.items() if k!='users'} | {'simulated':True}
@router.get('/shipments/{id}')
def shipment(id:str,user=Depends(authority)):
    with transaction() as s: return find(s,'shipments',id)
@router.get('/incidents')
def incidents(user=Depends(authority)):
    with transaction() as s: return s['incidents']
@router.post('/incidents',status_code=201)
def report(body:Incident,user=Depends(authority)):
    with transaction() as s:
        find(s,'shipments',body.shipment_id)
        row=body.model_dump()|dict(id=str(uuid4()),port_id=user['port_id'],reporter_id=user['id'],status='reported',created_at=now())
        s['incidents'].insert(0,row);alert(s,'New '+body.category+' report','critical' if body.category=='distress' else 'warning');return row
@router.patch('/incidents/{id}')
def review(id:str,body:Review,user=Depends(authority)):
    with transaction() as s:
        row=find(s,'incidents',id)
        if body.status not in {'reported':['confirmed','rejected'],'confirmed':['resolved']}.get(row['status'],[]): raise HTTPException(409,'Invalid incident transition')
        row['status']=body.status;audit(s,user,body.status,id);return row
@router.get('/route-requests')
def requests(user=Depends(authority)):
    with transaction() as s:return s['requests']
@router.patch('/route-requests/{id}')
def decide(id:str,body:Decision,user=Depends(authority)):
    with transaction() as s:
        row=find(s,'requests',id)
        if row['status']!='pending': raise HTTPException(409,'Request already decided')
        if body.status=='approved':
            option=next((o for o in row['options'] if o['id']==body.option_id),None)
            if option is None:raise HTTPException(422,'Choose a valid option')
            shipment=find(s,'shipments',row['shipment_id']);shipment['route_id']=option['id'];shipment['eta_hours']+=option['delay_hours']
        row.update(body.model_dump());row.update(reviewer=user['id'],reviewed_at=now())
        alert(s,f"{row['shipment_id']}: change {body.status}. {body.reason}");audit(s,user,body.status,id);return row
@router.get('/alerts')
def alerts(user=Depends(authority)):
    with transaction() as s:return s['alerts']
@router.post('/alerts',status_code=201)
def create_alert(body:Alert,user=Depends(authority)):
    with transaction() as s:return alert(s,body.message,body.severity)
@router.patch('/alerts/{id}/read')
def read_alert(id:str,user=Depends(authority)):
    with transaction() as s:
        row=find(s,'alerts',id)
        if user['id'] not in row['read_by']:row['read_by'].append(user['id'])
        return row
@router.post('/simulation/run')
def run(body:Scenario,user=Depends(authority)):
    with transaction() as s:return simulate(s['shipments'],body.duration_hours,body.severity)
