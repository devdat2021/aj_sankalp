from datetime import datetime, timezone
from uuid import uuid4
from fastapi import HTTPException

def now():
    return datetime.now(timezone.utc).isoformat()

def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

def find(state, kind, id):
    row = next((r for r in state[kind] if r['id'] == id), None)
    if row is None:
        raise HTTPException(404, 'Record not found')
    return row

def alert(state, message, severity='info'):
    row = dict(id=str(uuid4()), message=message, severity=severity, created_at=now(), read_by=[])
    state['alerts'].insert(0, row)
    return row

def audit(state, user, action, id):
    state['audit'].append(dict(actor=user['id'], action=action, record_id=id, created_at=now()))

def get_vessel_cargo(state, vessel_id: str, port_id: str):
    return [
        r for r in state['shipments']
        if r.get('vessel_id') == vessel_id
        and r['port_id'] == port_id
        and r['status'] not in {'delivered', 'in_transit'}
    ]

def get_compatible_berths(state, port_row: dict, requires_cold: bool) -> list[str]:
    total_berths = port_row.get('berths', 0)
    if port_row.get('occupied_berths', 0) >= total_berths:
        return []
    all_berths = [f'B{i}' for i in range(1, total_berths + 1)]
    reserved = {
        r.get('berth') for r in state['docking_requests']
        if r['status'] == 'approved' and r['port_id'] == port_row['id'] and r.get('berth')
    }
    cold_berths = set(port_row.get('cold_berths', [f'B{i}' for i in range(5, total_berths + 1)]))
    available = [b for b in all_berths if b not in reserved]
    if requires_cold:
        return [b for b in available if b in cold_berths]
    return available

def evaluate_docking_request(state: dict, req: dict, reference_time: datetime | None = None) -> dict:
    """
    Transparent multi-factor docking priority recommendation (0-100 scale):
      1. Perishable / cold-chain cargo (0-30 pts)
      2. Urgency based on ETA window (0-25 pts)
      3. Waiting time since request creation (0-20 pts)
      4. Berth compatibility (0-15 pts)
      5. Handling & cold-storage capacity readiness (0-10 pts)

    Returns a new dict with recommendation metadata and operational constraints.
    Priority is a recommendation only and never overrides safety/closure constraints.
    """
    ref_time = reference_time or datetime.now(timezone.utc)
    port_row = state['port']
    cargo = get_vessel_cargo(state, req['vessel_id'], req['port_id'])
    requires_cold = any(sh.get('requires_cold') for sh in cargo)
    total_qty = sum(sh.get('quantity', 0) for sh in cargo)
    unreserved_cold_qty = sum(sh.get('quantity', 0) for sh in cargo if sh.get('requires_cold') and not sh.get('cold_reserved'))

    # 1. Perishable cargo (0-30)
    perishable_pts = 0.0
    if requires_cold:
        perishable_pts = 25.0
        near_limit = any(
            sh.get('requires_cold')
            and sh.get('temperature') is not None
            and sh.get('max_temperature') is not None
            and sh['temperature'] >= sh['max_temperature'] - 1.0
            for sh in cargo
        )
        if near_limit:
            perishable_pts = 30.0

    # 2. Urgency (0-25) based on ETA
    eta_dt = _parse_dt(req.get('eta'))
    if eta_dt is not None:
        hours_to_eta = (eta_dt - ref_time).total_seconds() / 3600.0
    elif cargo:
        hours_to_eta = min(sh.get('eta_hours', 24) for sh in cargo)
    else:
        hours_to_eta = 48.0

    if hours_to_eta <= 6:
        urgency_pts = 25.0
    elif hours_to_eta <= 12:
        urgency_pts = 20.0
    elif hours_to_eta <= 24:
        urgency_pts = 15.0
    elif hours_to_eta <= 48:
        urgency_pts = 10.0
    else:
        urgency_pts = 5.0

    # 3. Waiting time (0-20): 2 pts per hour waited, capped at 20
    created_dt = _parse_dt(req.get('created_at'))
    waited_hours = max(0.0, (ref_time - created_dt).total_seconds() / 3600.0) if created_dt else 0.0
    waiting_pts = min(20.0, round(waited_hours * 2.0, 2))

    # 4. Berth compatibility (0-15)
    compatible_berths = get_compatible_berths(state, port_row, requires_cold)
    berth_pts = 15.0 if compatible_berths else 0.0

    # 5. Capacity readiness (0-10)
    handling_cap = port_row.get('handling_capacity', 500)
    handling_occ = port_row.get('handling_occupied', 0)
    cold_cap = port_row.get('cold_capacity', 0)
    cold_occ = port_row.get('cold_occupied', 0)

    handling_ok = (handling_occ + total_qty) <= handling_cap
    cold_ok = (cold_occ + unreserved_cold_qty) <= cold_cap
    capacity_pts = 10.0 if (handling_ok and cold_ok) else 0.0

    score = round(perishable_pts + urgency_pts + waiting_pts + berth_pts + capacity_pts, 2)

    # Operational constraints (cannot be overridden by priority)
    constraints = []
    if port_row.get('status') == 'closed':
        constraints.append('Port is closed')
    elif port_row.get('status') != 'open':
        constraints.append(f"Port operations {port_row.get('status')}")

    if not compatible_berths:
        constraints.append('No compatible berth available' if requires_cold else 'No available berth')

    if any(
        not any(
            a['shipment_id'] == sh['id'] and a['kind'] == 'handling' and a['status'] == 'approved'
            for a in state['port_requests']
        )
        for sh in cargo
    ):
        constraints.append('Cargo handling approval required')

    if not handling_ok:
        constraints.append('Insufficient cargo handling capacity')

    if not cold_ok:
        constraints.append('Insufficient cold-storage capacity')

    breakdown = {
        'perishable': perishable_pts,
        'urgency': urgency_pts,
        'waiting_time': waiting_pts,
        'berth_compatibility': berth_pts,
        'capacity': capacity_pts,
    }
    reason_parts = [
        f"Perishable (+{perishable_pts:g})",
        f"Urgency (+{urgency_pts:g})",
        f"Wait (+{waiting_pts:g})",
        f"Berth (+{berth_pts:g})",
        f"Capacity (+{capacity_pts:g})",
    ]
    return {
        **req,
        'priority_score': score,
        'priority_breakdown': breakdown,
        'priority_reason': ' · '.join(reason_parts),
        'compatible_berths': compatible_berths,
        'constraints': constraints,
        'eligible_for_approval': len(constraints) == 0,
    }

def enrich_docking_requests(state: dict, requests: list[dict], reference_time: datetime | None = None) -> list[dict]:
    """Evaluate, sort deterministically, and attach recommended_order to docking requests."""
    evaluated = [evaluate_docking_request(state, r, reference_time=reference_time) for r in requests]
    evaluated.sort(key=lambda r: (-r['priority_score'], r.get('created_at', ''), r.get('id', '')))
    order = 1
    for r in evaluated:
        if r['status'] in {'pending', 'slot_suggested'}:
            r['recommended_order'] = order
            order += 1
        else:
            r['recommended_order'] = None
    return evaluated
