from uuid import uuid4
from fastapi import HTTPException
from app.services.port_service import find, now

def require(user, *roles):
    if user['role'] not in roles:
        raise HTTPException(403, 'Role cannot perform this action')

def visible(user, shipment):
    role=user['role']
    if role=='port': return bool(user.get('port_id')) and shipment.get('port_id')==user['port_id']
    if role=='logistics': return bool(user.get('company_id')) and shipment.get('company_id')==user['company_id']
    if role=='driver': return bool(user.get('asset_id') and user.get('company_id')) and shipment.get('truck_id')==user['asset_id'] and shipment.get('company_id')==user['company_id']
    if role=='captain': return bool(user.get('asset_id')) and shipment.get('vessel_id')==user['asset_id']
    return False

def shipment(state, user, sid):
    row=next((r for r in state['shipments'] if r['id']==sid), None)
    if row is None or not visible(user, row): raise HTTPException(404, 'Consignment not found')
    return row


def logistics_vessel(row):
    """Shared tracking information, never a vessel's full manifest or history."""
    fields = ('id', 'name', 'status', 'movement_status', 'source', 'destination_port_id',
              'eta', 'eta_hours', 'lat', 'lng', 'last_seen', 'simulated')
    return {key: row[key] for key in fields if key in row}


def alert_view(user, row):
    if user['role'] != 'logistics':
        return row
    # Project a response, not the stored shared event; other readers must be preserved.
    result = {key: row[key] for key in ('id', 'message', 'severity', 'created_at') if key in row}
    result['recipient_ids'] = [user['id']]
    result['read_by'] = [user['id']] if user['id'] in row.get('read_by', []) else []
    return result

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
