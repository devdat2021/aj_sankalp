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


def reroute_block(row, sh):
    if sh['status'] == 'delivered':
        return 'Consignment delivered; no further route changes are allowed.'
    if 'assignment_version' in row and (
        row['assignment_version'] != sh.get('assignment_version', 0)
        or row.get('truck_id') != sh.get('truck_id')
        or row.get('base_route_id') != sh.get('route_id')
        or row.get('base_route') != sh.get('route')
    ):
        return 'Truck or approved route changed. Submit a fresh proposal.'
    return None


def route_request_view(row, sh):
    reason = reroute_block(row, sh) if row['status'] == 'pending' else None
    return row | ({'status': 'superseded', 'superseded_reason': reason} if reason else {})


def slot_conflict(sh, slot_timestamp):
    """Detect if the cargo ETA conflicts with the approved port pickup slot.

    Returns (conflict, reason) tuple.
    - conflict: True if ETA indicates arrival after the slot timestamp
    - reason: human-readable explanation, or None if no conflict
    """
    eta_hours = sh.get('eta_hours', 0)
    slot_ts = slot_timestamp  # timezone-aware UTC ISO string

    if not slot_ts:
        return False, None  # no slot set, no conflict

    from datetime import datetime, timezone

    try:
        slot_dt = datetime.fromisoformat(slot_ts)
        now = datetime.now(timezone.utc)
        # If slot is in the past and eta_hours > 0, it's a conflict
        if slot_dt < now and eta_hours > 0:
            return True, f'Slot {slot_ts} is in the past; ETA {eta_hours}h from creation would arrive later'
        # If slot is in the future, no conflict (yet)
        return False, None
    except (ValueError, TypeError):
        return False, None  # cannot parse slot timestamp


def request_slot_revision(state, user, sid, slot_timestamp):
    """Logistics requests a revised port pickup slot for a consignment.

    Returns (ok, reason) tuple.  When ok=True, a port_request is created with kind='slot_revision'.
    """
    from app.api.workflow import shipment as ship_func
    sh = ship_func(state, user, sid)

    # Check company match
    if not (bool(user.get('company_id')) and sh.get('company_id') == user['company_id']):
        return False, 'Company mismatch'

    # Check consignment is in a state where slot revision is allowed
    if sh['status'] in {'in_transit', 'delivered'}:
        return False, f'Cannot revise slot for cargo in status {sh["status"]}'

    # Validate slot_timestamp format
    try:
        datetime.fromisoformat(slot_timestamp)
    except (ValueError, TypeError):
        return False, 'Invalid slot_timestamp format. Must be ISO 8601 UTC string (e.g. 2026-12-01T10:00:00Z)'

    # Check for existing pending slot_revision for this shipment
    sh = ship_func(state, user, sid)
    existing_pending = any(
        r.get('shipment_id') == sh['id']
        and r.get('kind') == 'slot_revision'
        and r.get('status') == 'pending'
        for r in state.get('port_requests', [])
    )
    if existing_pending:
        return False, 'A slot revision request is already pending for this consignment. Wait for it to be resolved or rejected.'

    from uuid import uuid4
    from datetime import datetime, timezone

    row = {
        'id': str(uuid4()),
        'port_id': sh['port_id'],
        'shipment_id': sh['id'],
        'kind': 'slot_revision',
        'status': 'pending',
        'requester_id': user['id'],
        'created_at': now(),
        # Slot revision specific fields
        'slot_timestamp': slot_timestamp,
        'reason': f'ETA revision request for consignment {sh["id"]}',
    }
    state['port_requests'].append(row)
    notify(state, f'Slot revision requested: {sh["id"]}', [sh])
    return True, None






def supersede_routes(state, sh, reason):
    for row in state['requests']:
        if row['shipment_id'] == sh['id'] and row['status'] == 'pending':
            row.update(status='superseded', superseded_reason=reason, superseded_at=now())







def eligibility(state, user, sid):
    """Return pickup eligibility state for a consignment.

    Fields:
      - status: current cargo state
      - vessel_arrived: vessel has arrived/docked
      - unloaded: cargo has been unloaded
      - ready_for_pickup: port has certified readiness
      - truck_assigned: a truck is assigned
      - truck_access_approved: approved truck_access request matches assigned truck
      - pickup_allowed: all prerequisites satisfied for driver to record picked_up
    """
    sh = shipment(state, user, sid)


    # --- Basic fields ---
    status = sh.get('status', '')
    vessel_id = sh.get('vessel_id')
    truck_id = sh.get('truck_id')

    # --- Vessel arrival ---
    vessel_arrived = False
    if vessel_id:
        # Check if vessel has recorded arrived/docked events for this consignment
        vessel_events = [e for e in sh.get('events', []) if e.get('vessel_id') == vessel_id]
        vessel_arrived = any(e.get('event') in ('arrived', 'docked') for e in vessel_events if isinstance(e, dict))

    # --- Unloaded ---
    unloaded = status in {'unloaded', 'ready_for_pickup', 'in_transit', 'delivered'}

    # --- Ready for pickup ---
    ready_for_pickup = status == 'ready_for_pickup'

    # --- Truck assignment ---
    truck_assigned = bool(truck_id)

    # --- Truck access approved ---
    truck_access_approved = False
    if truck_assigned:
        truck_access_approved = any(
            r.get('shipment_id') == sh['id']
            and r.get('kind') == 'truck_access'
            and r.get('status') == 'approved'
            and r.get('truck_id') == truck_id
            for r in state.get('port_requests', [])
        )
    # --- Slot revision approved ---
    # An approved slot_revision replaces truck_access for the assigned truck
    slot_revision_approved = False
    if truck_assigned:
        slot_revision_approved = any(
            r.get('shipment_id') == sh['id']
            and r.get('kind') == 'slot_revision'
            and r.get('status') == 'approved'
            and r.get('truck_id') == truck_id
            for r in state.get('port_requests', [])
        )

    # --- Pickup allowed: ready_for_pickup AND (truck_access_approved OR slot_revision_approved) AND unloaded ---
    # Pickup is allowed when all three prerequisites are met.
    # Either truck_access approved OR an approved slot_revision for the same truck.
    pickup_allowed = ready_for_pickup and (truck_access_approved or slot_revision_approved) and unloaded

    return {
        'status': status,
        'vessel_arrived': vessel_arrived,
        'unloaded': unloaded,
        'ready_for_pickup': ready_for_pickup,
        'truck_assigned': truck_assigned,
        'truck_access_approved': truck_access_approved,
        'pickup_allowed': pickup_allowed,
        'blocked_reason': _blocked_reason(
            ready_for_pickup, truck_access_approved, unloaded,
            status, truck_id, vessel_arrived
        ),
    }


def _blocked_reason(ready_for_pickup, truck_access_approved, unloaded,
                    status, truck_id, vessel_arrived, slot_revision_approved=False):
    """Return a human-readable reason why pickup is blocked."""
    if ready_for_pickup and truck_access_approved and unloaded:
        return None  # pickup allowed
    if status in {'in_transit', 'delivered'}:
        return 'Cargo has already been picked up.'
    reasons = []
    if not unloaded:
        reasons.append('cargo not unloaded')
    if not ready_for_pickup:
        reasons.append('port has not marked ready for pickup')
    if not truck_access_approved and not slot_revision_approved:
        reasons.append('truck access not approved')
    if not truck_id:
        reasons.append('no truck assigned')
    elif not truck_access_approved:
        reasons.append('truck access not approved for assigned truck')
    if not reasons and ready_for_pickup and truck_access_approved:
        reasons.append('unknown block')
    return '; '.join(reasons)


def assign_eligible(state, user, sid):
    """Check whether a consignment is eligible for truck assignment.

    Returns (ok, reason) tuple.  ok is True when assignment is permitted;
    reason is None when ok, or a string explaining the block.
    """
    sh = shipment(state, user, sid)

    # Must not have started a trip already
    if sh['status'] in {'in_transit', 'delivered'}:
        return False, 'Trip already started'

    # Truck must belong to the same company
    truck_id = sh.get('truck_id')
    if truck_id:
        truck = next((v for v in state.get('vehicles', []) if v['id'] == truck_id), None)
        if not truck:
            return False, 'Truck not found'
        if truck.get('company_id') != user.get('company_id'):
            return False, 'Truck not owned by your company'
        # Check driver mapping is valid
        driver_id = truck.get('driver_id')
        if driver_id and driver_id not in {u['id'] for u in state.get('users', []) if u.get('active')}:
            return False, 'Truck driver mapping invalid'

    # Company must match
    if not (bool(user.get('company_id')) and sh.get('company_id') == user['company_id']):
        return False, 'Company mismatch'

    return True, None


def _event_id_from(event):
    """Preserve existing event ID when available, otherwise generate new one."""
    return event.get('id') or str(uuid4())


def _normalize_event(src, event_type, created_at, actor=None, details=None):
    """Normalize diverse event sources into a consistent representation."""
    base = {
        'id': _event_id_from(src),
        'event': event_type,
        'created_at': created_at,
    }
    if actor is not None:
        base['actor'] = actor
    if details:
        base['details'] = details
    return base


def consignment_history(state, user, sid):
    """Return a unified, chronologically-sorted consignment journey history.

    Collects from: shipment events[], related vessel events, port requests,
    and route requests.  Company-scoped — never reveals another company's cargo.
    """
    sh = shipment(state, user, sid)

    # --- Normalization helpers ---

    def make_event(payload, event_type, actor=None, details=None):
        """Create a normalized event dict with id, event, created_at."""
        return {
            'id': payload.get('id') or str(uuid4()),
            'event': event_type,
            'created_at': payload.get('created_at', ''),
            'actor': actor,
            'details': details or {},
        }

    # --- 1. Shipment‑owned events (vessel + cargo events already in sh['events']) ---

    events = []
    for e in sh.get('events', []):
        if not isinstance(e, dict): continue
        et = e.get('event', '')
        # Preserve the original created_at and id; never invent timestamps.
        events.append(make_event(e, et, actor=e.get('actor')))

    # --- 2. Port requests related to this shipment ---

    ship_id = sh['id']
    for pr in state.get('port_requests', []):
        if pr.get('shipment_id') != ship_id: continue
        # port request creation
        events.append(make_event(
            {'id': pr['id'], 'kind': pr.get('kind'), 'status': pr.get('status'),
             'requested_at': pr.get('requested_at'), 'reviewed_at': pr.get('reviewed_at')},
            event_type=f'port_{pr["kind"]}_{pr["status"]}',
            actor=pr.get('requester_id'),
            details={'kind': pr['kind'], 'status': pr['status'], 'slot': pr.get('slot'), 'reason': pr.get('reason')}
        ))
        # if approved, also record the decision timestamp
        if pr['status'] == 'approved' and pr.get('reviewed_at'):
            events.append(make_event(
                {'id': pr['id'] + ':decision', 'kind': pr['kind'], 'status': 'approved', 'slot': pr.get('slot')},
                event_type=f'port_{pr["kind"]}_approved',
                actor=pr.get('reviewer_id'),
                details={'kind': pr['kind'], 'slot': pr['slot'], 'reason': pr.get('reason')}
            ))

    # Route submission and decision are separate immutable facts.
    for rr in state.get('requests', []):
        if rr.get('shipment_id') != ship_id: continue
        events.append(make_event(
            {'id': rr['id'], 'created_at': rr.get('created_at')}, 'route_pending',
            actor=rr.get('requester_id'),
            details={'reason': rr.get('reason'), 'options': [o.get('name') for o in rr.get('options', [])]}
        ))
        if rr['status'] in ('approved', 'rejected') and rr.get('reviewed_at'):
            events.append(make_event(
                {'id': rr['id'] + ':decision', 'created_at': rr['reviewed_at']},
                event_type='route_' + rr['status'], actor=rr.get('reviewer'),
                details={'option_id': rr.get('option_id'),
                         'reason': rr.get('decision_reason', rr.get('reason')),
                         'eta_before_hours': rr.get('eta_before_hours'),
                         'eta_after_hours': rr.get('eta_after_hours')}
            ))
        if rr.get('superseded_at'):
            events.append(make_event(
                {'id': rr['id'] + ':superseded', 'created_at': rr['superseded_at']},
                'route_superseded', details={'reason': rr.get('superseded_reason')}
            ))

    # --- 4. Sort chronologically by created_at, dedupe by id ---

    # stable sort: earliest first; missing/empty timestamps sort last
    events.sort(key=lambda e: e.get('created_at') or '9999-99-99T23:59:59Z')

    seen = set()
    uniq = []
    for e in events:
        eid = e.get('id')
        if eid in seen: continue
        seen.add(eid)
        uniq.append(e)

    return uniq

def port(state, pid):
    if state['port']['id']!=pid: raise HTTPException(404, 'Port not found')
    return state['port']

def vessel(state, user, vid):
    row=find(state, 'vessels', vid)
    if user['role']=='captain' and (user.get('asset_id')!=vid or row.get('captain_id')!=user['id']):
        raise HTTPException(404, 'Vessel not found')
    return row
