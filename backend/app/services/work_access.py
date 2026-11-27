"""Assignment-bound QR credentials. Only hashes enter operational storage."""
from collections import OrderedDict
from hashlib import sha256
from secrets import token_urlsafe
from threading import Lock
from time import monotonic, time

from fastapi import HTTPException
from app.core.config import settings

TERMINAL = {'delivered', 'cancelled', 'canceled', 'completed'}
_windows = OrderedDict()
_lock = Lock()


def protect(request, limit):
    if not settings.demo_mode and request.url.scheme != 'https':
        raise HTTPException(403, 'HTTPS required for driver access')
    key = (request.client.host if request.client else '', limit)
    minute = int(monotonic() // 60)
    with _lock:
        window, count = _windows.get(key, (minute, 0))
        count = count + 1 if window == minute else 1
        _windows[key] = (minute, count)
        _windows.move_to_end(key)
        if len(_windows) > 8192:
            _windows.popitem(last=False)
    if count > limit:
        raise HTTPException(429, 'Too many requests. Try again in a minute.')


def digest(token):
    return sha256(token.encode()).hexdigest()


def assignment_driver(state, sh):
    if not sh or sh['status'] in TERMINAL:
        return None
    truck = next((v for v in state['vehicles'] if v['id'] == sh.get('truck_id')
                  and v.get('company_id') == sh['company_id']), None)
    if truck:
        return next((u for u in state['users'] if u['id'] == truck.get('driver_id')
                     and u['active'] and u['role'] == 'driver' and u.get('asset_id') == truck['id']
                     and u.get('company_id') == sh['company_id']), None)


def issue(state, sh):
    driver = assignment_driver(state, sh)
    if not driver:
        raise HTTPException(409, 'An active assigned driver is required')
    revoke(state, sh['id'])
    token = token_urlsafe(32)
    state['work_access'].append(dict(id=digest(token), shipment_id=sh['id'], truck_id=sh['truck_id'],
        driver_id=driver['id'], company_id=sh['company_id'], expires=time() + 7 * 86400, sessions=[]))
    return token


def revoke(state, shipment_id):
    state['work_access'][:] = [r for r in state['work_access'] if r['shipment_id'] != shipment_id]


def bound_driver(state, record):
    sh = next((r for r in state['shipments'] if r['id'] == record['shipment_id']), None)
    driver = assignment_driver(state, sh)
    if driver and (driver['id'], sh['truck_id'], sh['company_id']) == (
            record['driver_id'], record['truck_id'], record['company_id']):
        return driver


def prune(state):
    records = state.get('work_access', [])
    records[:] = [r for r in records if r['expires'] > time() and bound_driver(state, r)]


def denied():
    return HTTPException(401, 'Driver access expired or withdrawn. Ask logistics for a new QR code.')


def exchange(state, token):
    record = next((r for r in state['work_access'] if r['id'] == digest(token)), None)
    if not record or record['expires'] <= time() or not bound_driver(state, record):
        raise denied()
    session = 'work-' + token_urlsafe(32)
    record['sessions'] = [s for s in record['sessions'] if s['expires'] > time()][-15:]
    record['sessions'].append(dict(id=digest(session), expires=min(record['expires'], time() + 12 * 3600)))
    driver = bound_driver(state, record)
    return dict(token=session, user={k: driver.get(k) for k in ('id','name','role','company_id','asset_id')})


def resolve(state, identity):
    if isinstance(identity, dict):
        return identity
    for record in state['work_access']:
        if record['expires'] > time() and any(s['id'] == identity and s['expires'] > time() for s in record['sessions']):
            driver = bound_driver(state, record)
            if driver:
                return dict(driver, work_shipment=record['shipment_id'])
    raise denied()
