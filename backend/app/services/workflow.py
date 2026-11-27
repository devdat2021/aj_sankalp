from uuid import uuid4
from fastapi import HTTPException
from app.services.port_service import find, now

def require(user, *roles):
    if user['role'] not in roles:
        raise HTTPException(403, 'Role cannot perform this action')

def visible(user, shipment):
    role=user['role']
    if role=='port': return shipment['port_id']==user.get('port_id')
    if role=='logistics': return shipment['company_id']==user.get('company_id')
    if role=='driver': return shipment.get('truck_id')==user.get('asset_id') and shipment['company_id']==user.get('company_id')
    if role=='captain': return shipment.get('vessel_id')==user.get('asset_id')
    return False

def shipment(state, user, sid):
    row=find(state, 'shipments', sid)
    if not visible(user, row): raise HTTPException(404, 'Consignment not found')
    return row

def recipients(state, rows):
    return sorted({u['id'] for u in state['users'] if u['active'] and any(visible(u, s) for s in rows)})

def notify(state, message, rows, severity='info', event_key=None):
    if event_key:
        existing=next((a for a in state['alerts'] if a.get('event_key')==event_key), None)
        if existing: return existing
    row=dict(id=str(uuid4()), message=message, severity=severity, created_at=now(),
             recipient_ids=recipients(state, rows), read_by=[], event_key=event_key)
    state['alerts'].insert(0,row)
    return row

def pending(row):
    if row['status']!='pending': raise HTTPException(409, 'Request already decided')

def port(state, pid):
    if state['port']['id']!=pid: raise HTTPException(404, 'Port not found')
    return state['port']

def vessel(state, user, vid):
    row=find(state, 'vessels', vid)
    if user['role']=='captain' and (user.get('asset_id')!=vid or row.get('captain_id')!=user['id']):
        raise HTTPException(404, 'Vessel not found')
    return row
