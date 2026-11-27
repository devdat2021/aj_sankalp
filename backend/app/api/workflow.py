from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import current_user, authority
from app.core.config import settings
from app.database.connection import transaction
from app.schemas.port import Review, Decision, Scenario, Incident
from typing import Literal
from app.schemas.workflow import (Consignment, Assignment, RouteRequest, PortRequest,
    DockRequest, Approval, DockApproval, Capacity, Position, Milestone, Warning)
from app.services.port_service import find, audit, now, evaluate_docking_request, enrich_docking_requests, get_vessel_cargo
from app.services.workflow import require, visible, shipment, notify, pending, port, vessel
from app.intelligence.simulation.engine import simulate
from app.services.weather import forecast

router=APIRouter(prefix='/api')

@router.get('/health')
def health():
    with transaction(): pass
    return dict(status='ok',demo_mode=settings.demo_mode,storage='MongoDB' if settings.mongodb_uri else 'local JSON')

@router.get('/me')
def me(user=Depends(current_user)): return user

@router.get('/{role}/dashboard')
def dashboard(role: str,user=Depends(current_user)):
    if role not in {'port','logistics','driver','captain'}: raise HTTPException(404,'Unknown portal')
    require(user,role)
    with transaction() as s:
        rows=[r for r in s['shipments'] if visible(user,r)]; ids={r['id'] for r in rows}
        result=dict(user_id=user['id'],shipments=rows,port=s['port'],simulated=True,
            vessels=[v for v in s['vessels'] if v['id'] in {r.get('vessel_id') for r in rows} or (role=='captain' and v['id']==user.get('asset_id'))],
            vehicles=[v for v in s['vehicles'] if v['id'] in {r.get('truck_id') for r in rows} or (role=='logistics' and v['company_id']==user.get('company_id'))],
            incidents=[r for r in s['incidents'] if r['shipment_id'] in ids],
            requests=[r for r in s['requests'] if r['shipment_id'] in ids],
            alerts=[a for a in s['alerts'] if user['id'] in a['recipient_ids']],
            port_requests=[r for r in s['port_requests'] if r['shipment_id'] in ids],
            docking_requests=enrich_docking_requests(s, [r for r in s['docking_requests'] if (role=='port' and r['port_id']==user.get('port_id')) or (role=='captain' and r['vessel_id']==user.get('asset_id'))]))
        if role=='port': result['audit']=s['audit']
        return result

@router.get('/shipments/{id}')
def get_shipment(id: str,user=Depends(current_user)):
    with transaction() as s: return shipment(s,user,id)

@router.post('/shipments',status_code=201)
def create_shipment(body: Consignment,user=Depends(current_user)):
    require(user,'logistics')
    with transaction() as s:
        port(s,body.port_id)
        if body.vessel_id: find(s,'vessels',body.vessel_id)
        row=body.model_dump() | dict(id=str(uuid4()),company_id=user['company_id'],truck_id=None,status='planned',events=[])
        s['shipments'].append(row); audit(s,user,'consignment_created',row['id']); return row

@router.put('/shipments/{id}/assignment')
def assign(id: str,body: Assignment,user=Depends(current_user)):
    require(user,'logistics')
    with transaction() as s:
        row=shipment(s,user,id); truck=find(s,'vehicles',body.truck_id)
        if truck['company_id']!=user['company_id']: raise HTTPException(404,'Truck not found')
        if row['status'] in {'in_transit','delivered'}: raise HTTPException(409,'Trip already started')
        row.update(truck_id=truck['id'],route_id=body.route.id,route=body.route.model_dump())
        audit(s,user,'truck_assigned',id); notify(s,'Truck and route assigned: '+id,[row]); return row

@router.get('/incidents')
def incidents(user=Depends(current_user)):
    with transaction() as s:
        ids={r['id'] for r in s['shipments'] if visible(user,r)}
        return [r for r in s['incidents'] if r['shipment_id'] in ids]

@router.post('/incidents',status_code=201)
def report(body: Incident,user=Depends(current_user)):
    with transaction() as s:
        sh=shipment(s,user,body.shipment_id)
        row=body.model_dump() | dict(id=str(uuid4()),port_id=sh['port_id'],reporter_id=user['id'],status='reported',created_at=now())
        s['incidents'].insert(0,row); notify(s,'New '+body.category+' report',[sh],'critical' if body.category=='distress' else 'warning',row['id']); return row

@router.patch('/incidents/{id}')
def review(id: str,body: Review,user=Depends(authority)):
    with transaction() as s:
        row=find(s,'incidents',id); shipment(s,user,row['shipment_id'])
        if body.status not in {'reported':['confirmed','rejected'],'confirmed':['resolved']}.get(row['status'],[]): raise HTTPException(409,'Invalid incident transition')
        row['status']=body.status; audit(s,user,body.status,id); return row

@router.get('/route-requests')
def requests(user=Depends(current_user)):
    with transaction() as s:
        ids={r['id'] for r in s['shipments'] if visible(user,r)}
        return [r for r in s['requests'] if r['shipment_id'] in ids]

@router.post('/route-requests',status_code=201)
def request_route(body: RouteRequest,user=Depends(current_user)):
    require(user,'driver','logistics')
    with transaction() as s:
        sh=shipment(s,user,body.shipment_id)
        if sh['status']=='delivered': raise HTTPException(409,'Consignment delivered')
        if len({o.id for o in body.options})!=len(body.options): raise HTTPException(422,'Option IDs must be unique')
        if any(r['shipment_id']==sh['id'] and r['status']=='pending' for r in s['requests']): raise HTTPException(409,'Pending reroute exists')
        row=body.model_dump() | dict(id=str(uuid4()),port_id=sh['port_id'],requester_id=user['id'],status='pending',created_at=now())
        s['requests'].append(row); notify(s,'Reroute requested: '+sh['id'],[sh]); return row

@router.patch('/route-requests/{id}')
def decide(id: str,body: Decision,user=Depends(current_user)):
    require(user,'logistics')
    with transaction() as s:
        row=find(s,'requests',id); sh=shipment(s,user,row['shipment_id']); pending(row)
        if body.status=='approved':
            option=next((o for o in row['options'] if o['id']==body.option_id),None)
            if option is None: raise HTTPException(422,'Choose a valid option')
            sh.update(route_id=option['id'],route=option); sh['eta_hours']+=option['delay_hours']
        row.update(body.model_dump()); row.update(reviewer=user['id'],reviewed_at=now())
        notify(s,f"{sh['id']}: reroute {body.status}. {body.reason}",[sh],event_key=id+':decision'); audit(s,user,body.status,id); return row

@router.get('/ports/{id}/capacity')
def capacity(id: str,user=Depends(current_user)):
    with transaction() as s: return port(s,id)

@router.patch('/ports/{id}/capacity')
def set_capacity(id: str,body: Capacity,user=Depends(authority)):
    if id!=user['port_id']: raise HTTPException(404,'Port not found')
    if body.occupied_berths>body.berths or body.cold_occupied>body.cold_capacity: raise HTTPException(422,'Occupancy exceeds capacity')
    with transaction() as s:
        row=port(s,id)
        yard_cap = body.yard_capacity if body.yard_capacity is not None else row.get('yard_capacity', 1000)
        yard_occ = body.yard_occupied if body.yard_occupied is not None else row.get('yard_occupied', 0)
        hand_cap = body.handling_capacity if body.handling_capacity is not None else row.get('handling_capacity', 500)
        hand_occ = body.handling_occupied if body.handling_occupied is not None else row.get('handling_occupied', 0)
        if yard_occ > yard_cap or hand_occ > hand_cap:
            raise HTTPException(422,'Occupancy exceeds capacity')
        reserved=sum(sh['quantity'] for sh in s['shipments'] if sh.get('cold_reserved') and sh['port_id']==id)
        docks=[r for r in s['docking_requests'] if r['status']=='approved' and r['port_id']==id]
        if body.cold_occupied<reserved or body.occupied_berths<len(docks): raise HTTPException(409,'Occupancy cannot drop below active reservations')
        if any(int(r['berth'][1:])>body.berths for r in docks): raise HTTPException(409,'An active berth would be removed')
        updates = body.model_dump(exclude_none=True)
        row.update(updates); audit(s,user,'capacity_updated',id); return row

@router.post('/port-requests',status_code=201)
def request_port(body: PortRequest,user=Depends(current_user)):
    require(user,'logistics')
    with transaction() as s:
        sh=shipment(s,user,body.shipment_id)
        if sh['status']=='delivered': raise HTTPException(409,'Consignment delivered')
        if body.kind=='truck_access' and not sh.get('truck_id'): raise HTTPException(409,'Assign a truck first')
        if any(r['shipment_id']==sh['id'] and r['kind']==body.kind and r['status']=='pending' for r in s['port_requests']): raise HTTPException(409,'Pending request exists')
        row=body.model_dump(mode='json') | dict(id=str(uuid4()),port_id=sh['port_id'],status='pending',requester_id=user['id'],created_at=now())
        if body.kind=='truck_access': row['truck_id']=sh['truck_id']
        s['port_requests'].append(row); notify(s,'Port access requested: '+sh['id'],[sh]); return row

@router.get('/port-requests')
def port_requests(user=Depends(current_user)):
    with transaction() as s:
        ids={r['id'] for r in s['shipments'] if visible(user,r)}
        return [r for r in s['port_requests'] if r['shipment_id'] in ids]

@router.patch('/port-requests/{id}')
def approve_port(id: str,body: Approval,user=Depends(authority)):
    with transaction() as s:
        row=find(s,'port_requests',id); sh=shipment(s,user,row['shipment_id'])
        if row['status'] not in {'pending', 'slot_suggested'}: raise HTTPException(409,'Request already decided')
        p=port(s,row['port_id'])
        if body.status=='approved':
            if not body.slot: raise HTTPException(422,'Approved slot required')
            if p['status']=='closed': raise HTTPException(409,'Port closed')
            if row['kind']=='truck_access' and row['truck_id']!=sh.get('truck_id'): raise HTTPException(409,'Truck assignment changed; submit new access request')
            if row['kind']=='handling' and sh['requires_cold']:
                if sh.get('cold_reserved'): raise HTTPException(409,'Capacity already reserved')
                if p['cold_occupied']+sh['quantity']>p['cold_capacity']: raise HTTPException(409,'Insufficient cold capacity')
                p['cold_occupied']+=sh['quantity']; sh['cold_reserved']=True
            row.update(body.model_dump(mode='json', exclude_none=True))
        elif body.status=='slot_suggested':
            payload = body.model_dump(mode='json', exclude_none=True)
            payload.pop('slot', None)
            row.update(payload)
            row['suggested_slot'] = dict(start=payload['suggested_start'], end=payload['suggested_end'])
        else:
            row.update(body.model_dump(mode='json', exclude_none=True))
        row.update(reviewer=user['id'],reviewed_at=now())
        notify(s,'Port '+row['kind']+' '+body.status+': '+sh['id'],[sh],event_key=id+':'+body.status); audit(s,user,body.status,id); return row

@router.get('/alerts')
def alerts(user=Depends(current_user)):
    with transaction() as s: return [a for a in s['alerts'] if user['id'] in a['recipient_ids']]

@router.post('/alerts',status_code=201)
def warning(body: Warning,user=Depends(authority)):
    with transaction() as s:
        rows=[shipment(s,user,sid) for sid in body.shipment_ids] if body.shipment_ids else [r for r in s['shipments'] if visible(user,r)]
        row=notify(s,body.message,rows,body.severity); audit(s,user,'warning_published',row['id']); return row

@router.patch('/alerts/{id}/read')
def read_alert(id: str,user=Depends(current_user)):
    with transaction() as s:
        row=find(s,'alerts',id)
        if user['id'] not in row['recipient_ids']: raise HTTPException(404,'Alert not found')
        if user['id'] not in row['read_by']: row['read_by'].append(user['id'])
        return row

@router.post('/tracking/location')
def tracking(body: Position,user=Depends(current_user)):
    require(user,'driver','captain'); observed=body.observed_at
    if observed.tzinfo is None or observed>datetime.now(timezone.utc): raise HTTPException(422,'Use a non-future timezone-aware observation')
    with transaction() as s:
        row=find(s,'vehicles' if user['role']=='driver' else 'vessels',user['asset_id'])
        owner='driver_id' if user['role']=='driver' else 'captain_id'
        if row.get(owner)!=user['id']: raise HTTPException(404,'Asset not found')
        if row.get('last_seen') and observed<=datetime.fromisoformat(row['last_seen']): raise HTTPException(409,'Stale location')
        row.update(lat=body.lat,lng=body.lng,last_seen=observed.astimezone(timezone.utc).isoformat(),simulated=settings.demo_mode); return row

@router.post('/simulation/run')
def run(body: Scenario,user=Depends(authority)):
    with transaction() as s: return simulate([r for r in s['shipments'] if visible(user,r)],body.duration_hours,body.severity)

@router.post('/docking-requests',status_code=201)
def request_dock(body: DockRequest,user=Depends(current_user)):
    require(user,'captain')
    with transaction() as s:
        vessel(s,user,body.vessel_id); port(s,body.port_id)
        if any(r['vessel_id']==body.vessel_id and r['status'] in {'pending','slot_suggested','approved'} for r in s['docking_requests']): raise HTTPException(409,'Active docking request exists')
        cargo=get_vessel_cargo(s,body.vessel_id,body.port_id)
        row=body.model_dump(mode='json') | dict(id=str(uuid4()),status='pending',requester_id=user['id'],created_at=now(),priority=1 if any(r['requires_cold'] for r in cargo) else 0)
        evaluated=evaluate_docking_request(s,row)
        row['priority_score']=evaluated['priority_score']
        row['priority_reason']=evaluated['priority_reason']
        s['docking_requests'].append(row)
        notice=notify(s,'Docking requested: '+body.vessel_id,cargo)
        notice['recipient_ids']=sorted(set(notice['recipient_ids']) | {user['id']} | {u['id'] for u in s['users'] if u['active'] and u['role']=='port' and u.get('port_id')==body.port_id})
        return evaluated

@router.get('/docking-requests')
def docking_requests(user=Depends(current_user)):
    require(user,'port','captain')
    with transaction() as s:
        filtered=[r for r in s['docking_requests'] if (user['role']=='port' and r['port_id']==user['port_id']) or (user['role']=='captain' and r['vessel_id']==user['asset_id'])]
        return enrich_docking_requests(s,filtered)

@router.patch('/docking-requests/{id}')
def approve_dock(id: str,body: DockApproval,user=Depends(authority)):
    with transaction() as s:
        row=find(s,'docking_requests',id)
        if row['port_id']!=user['port_id']: raise HTTPException(404,'Docking request not found')
        if row['status'] not in {'pending','slot_suggested'}: raise HTTPException(409,'Request already decided')
        p=port(s,row['port_id'])
        cargo=get_vessel_cargo(s,row['vessel_id'],row['port_id'])
        if body.status=='approved':
            if not body.slot or not body.berth: raise HTTPException(422,'Berth and slot required')
            if body.berth not in {f'B{i}' for i in range(1,p['berths']+1)}: raise HTTPException(422,'Unknown berth; use B1 through configured berth count')
            if p['status']!='open' or p['occupied_berths']>=p['berths']: raise HTTPException(409,'No available berth or port restricted')
            if any(r['status']=='approved' and r.get('berth')==body.berth for r in s['docking_requests']): raise HTTPException(409,'Berth reserved')
            if any(not any(a['shipment_id']==sh['id'] and a['kind']=='handling' and a['status']=='approved' for a in s['port_requests']) for sh in cargo): raise HTTPException(409,'Cargo handling approval required')
            requires_cold=any(sh.get('requires_cold') for sh in cargo)
            cold_berths=set(p.get('cold_berths',[f'B{i}' for i in range(5,p['berths']+1)]))
            if requires_cold and body.berth not in cold_berths: raise HTTPException(409,'Selected berth is not compatible with refrigerated cargo')
            total_qty=sum(sh.get('quantity',0) for sh in cargo)
            if p.get('handling_occupied',0)+total_qty>p.get('handling_capacity',500): raise HTTPException(409,'Insufficient cargo handling capacity')
            unreserved_cold=sum(sh.get('quantity',0) for sh in cargo if sh.get('requires_cold') and not sh.get('cold_reserved'))
            if p['cold_occupied']+unreserved_cold>p['cold_capacity']: raise HTTPException(409,'Insufficient cold-storage capacity')
            p['occupied_berths']+=1
            row.update(body.model_dump(mode='json',exclude_none=True))
        elif body.status=='slot_suggested':
            payload=body.model_dump(mode='json',exclude_none=True)
            payload.pop('slot',None)
            payload.pop('berth',None)
            row.update(payload)
            row['suggested_slot']=dict(start=payload['suggested_start'],end=payload['suggested_end'])
        else:
            row.update(body.model_dump(mode='json',exclude_none=True))
        row.update(reviewer=user['id'],reviewed_at=now())
        notice=notify(s,'Docking '+body.status+': '+row['vessel_id'],cargo,event_key=id+':'+body.status)
        if row['requester_id'] not in notice['recipient_ids']: notice['recipient_ids'].append(row['requester_id'])
        audit(s,user,body.status,id); return evaluate_docking_request(s,row)

@router.post('/vessels/{id}/events')
def vessel_event(id: str,body: Milestone,user=Depends(current_user)):
    require(user,'captain')
    if body.event not in {'departed','arrived','docked'}: raise HTTPException(422,'Invalid vessel event')
    with transaction() as s:
        v=vessel(s,user,id)
        previous=v.get('movement_status','planned')
        allowed={'planned':['departed','arrived'],'departed':['arrived'],'arrived':['docked'],'docked':['departed']}
        if body.event not in allowed.get(previous,[]): raise HTTPException(409,'Invalid vessel transition')
        approval=next((r for r in s['docking_requests'] if r['vessel_id']==id and r['status']=='approved'),None)
        if body.event=='docked' and not approval: raise HTTPException(409,'Docking approval required')
        cargo=[r for r in s['shipments'] if r.get('vessel_id')==id and r['status'] in {'planned','at_sea','arrived','at_port'}]
        if body.event=='departed' and previous=='docked' and approval:
            if cargo: raise HTTPException(409,'Unload inbound cargo before departure')
            approval['status']='completed'; s['port']['occupied_berths']=max(0,s['port']['occupied_berths']-1)
        v['movement_status']=body.event
        v['status']=body.event
        if body.eta_hours is not None: v['eta_hours']=body.eta_hours
        event=dict(id=str(uuid4()),vessel_id=id,event=body.event,created_at=now(),eta_hours=body.eta_hours)
        s['events'].append(event)
        for sh in cargo:
            sh['status']={'departed':'at_sea','arrived':'arrived','docked':'at_port'}[body.event]
            if body.eta_hours is not None: sh['eta_hours']=body.eta_hours
            sh['events'].append(event)
            notify(s,f"Consignment {sh['id']}: vessel {body.event}; ETA {sh['eta_hours']} hours",[sh],event_key=event['id']+sh['id'])
        audit(s,user,body.event,id); return event

@router.post('/shipments/{id}/events')
def cargo_event(id: str,body: Milestone,user=Depends(current_user)):
    roles={'unloaded':'port','ready_for_pickup':'port','picked_up':'driver','delivered':'driver'}
    if body.event not in roles: raise HTTPException(422,'Use vessel events for sea movements')
    require(user,roles[body.event])
    transitions={'unloaded':('at_port','unloaded'),'ready_for_pickup':('unloaded','ready_for_pickup'),'picked_up':('ready_for_pickup','in_transit'),'delivered':('in_transit','delivered')}
    with transaction() as s:
        sh=shipment(s,user,id); before,after=transitions[body.event]
        if sh['status']!=before: raise HTTPException(409,'Invalid cargo transition')
        if body.event=='picked_up':
            if not any(r['shipment_id']==id and r['kind']=='truck_access' and r['status']=='approved' and r.get('truck_id')==sh.get('truck_id') for r in s['port_requests']): raise HTTPException(409,'Truck access approval required')
            if sh.get('cold_reserved'):
                s['port']['cold_occupied']=max(0,s['port']['cold_occupied']-sh['quantity']); sh['cold_reserved']=False
        sh['status']=after
        event=dict(id=str(uuid4()),event=body.event,created_at=now(),actor=user['id'])
        sh['events'].append(event); notify(s,id+': '+body.event,[sh],event_key=event['id']); audit(s,user,body.event,id); return sh

@router.get('/ports/{id}/weather')
def weather(id: str,mode: Literal['land','marine']='land',user=Depends(current_user)):
    with transaction() as s: p=port(s,id).copy()
    return forecast(p['lat'],p['lng'],mode)
