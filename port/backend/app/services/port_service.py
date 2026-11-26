from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException
def now(): return datetime.now(timezone.utc).isoformat()
def find(state,kind,id):
    row=next((r for r in state[kind] if r['id']==id),None)
    if row is None: raise HTTPException(404,'Record not found')
    return row
def alert(state,message,severity='info'):
    row=dict(id=str(uuid4()),message=message,severity=severity,created_at=now(),read_by=[])
    state['alerts'].insert(0,row);return row
def audit(state,user,action,id): state['audit'].append(dict(actor=user['id'],action=action,record_id=id,created_at=now()))
