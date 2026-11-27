"""Read-only operational planning. SQL simulation estimates never enter this module."""
import hashlib
import json
import math
import re
from datetime import datetime, timezone, timedelta
from copy import deepcopy
from app.schemas.intelligence import AnalystReview
from app.services.intelligence_external import IntegrationError


def utcnow():
    return datetime.now(timezone.utc)


def dt(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamp must include timezone')
    return result.astimezone(timezone.utc)


def google_time(value, lower_bound=False):
    # Google rejects fractional seconds. Round inward, never relax a constraint.
    if lower_bound and value.microsecond:
        value += timedelta(seconds=1)
    return value.replace(microsecond=0).isoformat()


def fingerprint(state):
    # Conservative snapshot guard also catches competing fleet/port decisions.
    keys = ('port', 'shipments', 'vessels', 'vehicles', 'incidents', 'port_requests', 'docking_requests', 'users')
    return hashlib.sha256(json.dumps({k: state.get(k) for k in keys}, sort_keys=True, default=str).encode()).hexdigest()


def affected(state, root):
    """Transitive shared-vessel/shared-truck dependencies, bounded to the owning company."""
    rows = [s for s in state['shipments'] if s.get('company_id') == root.get('company_id') and s.get('port_id') == root.get('port_id') and s.get('status') != 'delivered']
    selected = {root['id']}
    while True:
        linked = [s for s in rows if s['id'] in selected]
        vessels = {s.get('vessel_id') for s in linked} - {None, ''}
        trucks = {s.get('truck_id') for s in linked} - {None, ''}
        new = {s['id'] for s in rows if s.get('vessel_id') in vessels or s.get('truck_id') in trucks}
        if new <= selected:
            return [s for s in rows if s['id'] in selected]
        selected |= new


def domain_blocks(state, sh):
    p = state['port']
    blocks = []
    if sh['port_id'] != p['id'] or p.get('status') != 'open':
        blocks.append('Port is not open for this shipment')
    for resource in ('yard', 'handling') + (('cold',) if sh.get('requires_cold') else ()):
        cap, used = p.get(resource + '_capacity'), p.get(resource + '_occupied')
        if cap is None or used is None:
            blocks.append(f'{resource} capacity unknown')
        elif used >= cap:
            blocks.append(f'{resource} capacity exhausted; port decision required')
    if sh.get('hazard_stopped'):
        blocks.append('Active hazard requires existing incident/reroute workflow')
    if sh.get('status') in {'in_transit', 'delivered'}:
        blocks.append('Transport already started')
    return blocks


def assess(state, rows):
    evidence = []
    def add(kind, ids, details):
        evidence.append(dict(id=f'E{len(evidence)+1}', kind=kind, entity_ids=ids, details=details))
    ids = {s['id'] for s in rows}
    for i in state['incidents']:
        if i.get('shipment_id') in ids and i.get('status') in {'reported', 'confirmed'}:
            add('reported_incident', [i['shipment_id'], i['id']], {k: i.get(k) for k in ('category', 'severity', 'description', 'status', 'created_at')})
    for s in rows:
        v = next((v for v in state['vessels'] if v['id'] == s.get('vessel_id')), {})
        add('operational_state', [s['id']], {k: s.get(k) for k in ('status', 'truck_id', 'vessel_id', 'cargo_ready_at', 'delivery_deadline', 'planned_pickup_at', 'planned_delivery_at')})
        if v.get('expected_arrival_at'):
            add('vessel_arrival', [s['id'], v['id']], {'expected_arrival_at': v['expected_arrival_at'], 'observed_at': v.get('eta_observed_at')})
            if s.get('planned_pickup_at'):
                add('vessel_pickup_dependency', [s['id'], v['id']], {'pickup_before_arrival_seconds': max(0, (dt(v['expected_arrival_at'])-dt(s['planned_pickup_at'])).total_seconds())})
        if s.get('requires_cold') and s.get('temperature') is not None and s.get('max_temperature') is not None:
            add('cold_chain', [s['id']], {'temperature': s['temperature'], 'max_temperature': s['max_temperature'], 'exceedance_c': max(0, s['temperature'] - s['max_temperature']), 'observation_time': s.get('temperature_observed_at'), 'uncertainty': 'No spoilage prediction; sensor freshness may be unknown'})
        for block in domain_blocks(state, s):
            add('domain_constraint', [s['id']], {'reason': block})
        if s.get('delivery_deadline') and s.get('planned_delivery_at'):
            add('deadline', [s['id']], {'baseline_lateness_seconds': max(0, (dt(s['planned_delivery_at'])-dt(s['delivery_deadline'])).total_seconds())})
    add('port_capacity', [state['port']['id']], {k: v for k, v in state['port'].items() if 'capacity' in k or 'occupied' in k or k == 'status'})
    return evidence


def weather_evidence(item):
    hourly = item.get('forecast', {}).get('hourly', {})
    fields = ('wave_height',) if item['mode']=='marine' else ('wind_speed_10m', 'precipitation')
    output = {}
    for key in fields:
        values = [v for v in hourly.get(key, []) if isinstance(v, (float, int)) and math.isfinite(v)]
        if values:
            output['forecast_max_'+key] = max(values)
    return output | {'units':item.get('forecast', {}).get('hourly_units', {}),
                    'assessment':'Forecast exposure only; operational thresholds and local confirmation are required'}


def decode_polyline(encoded):
    points, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        coords=[]
        for _ in range(2):
            value, shift = 0, 0
            while True:
                if index >= len(encoded) or shift > 30:
                    raise ValueError('Invalid route geometry')
                byte=ord(encoded[index])-63; index+=1
                value |= (byte & 31) << shift; shift+=5
                if byte < 32: break
            coords.append(~(value>>1) if value & 1 else value>>1)
        lat+=coords[0]; lng+=coords[1]
        points.append([lat/1e5,lng/1e5])
    return points


def plan_hazards(state, plan, rows):
    # Reuse the application's existing incident geometry check. These circular buffers
    # are conservative screening assumptions, not externally confirmed road closures.
    from app.services.workflow import active_road_hazards, route_hazard_conflicts
    relevant=[s for s in rows if s['id'] in {a['shipment_id'] for a in plan['assignments']}]
    if not any(active_road_hazards(state,s) for s in relevant):
        return []
    try:
        points=decode_polyline((plan.get('polyline') or {})['points'])
        if len(points)<2: raise ValueError('Missing geometry')
    except (KeyError, ValueError, TypeError):
        return ['Route geometry unavailable for active road hazard screening']
    return sorted({c for s in relevant for c in route_hazard_conflicts(state,s,{'points':points})})


def point(value):
    lat, lng = float(value['lat']), float(value['lng'])
    if not math.isfinite(lat + lng) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError('Invalid coordinates')
    return {'latitude': lat, 'longitude': lng}


def build_request(state, rows, now=None):
    now = now or utcnow()
    missing, vehicles, shipments = [], [], []
    selected = {s['id'] for s in rows}
    company = rows[0]['company_id'] if rows else None
    fleet = []
    for v in state['vehicles']:
        if v.get('company_id') != company:
            continue
        if not v.get('available') or v.get('hazard_stopped') or v.get('status', '').lower() in {'in transit', 'unavailable', 'maintenance', 'stopped / unable to continue'}:
            missing.append(f"{v['id']}: unavailable or availability not confirmed")
            continue
        if any(s.get('truck_id') == v['id'] and s['id'] not in selected and s['status'] != 'delivered' for s in state['shipments']):
            missing.append(f"{v['id']}: reserved by another consignment")
            continue
        try:
            start, end = max(now, dt(v['available_from'])), dt(v['available_until'])
            if end <= now:
                missing.append(f"{v['id']}: availability shift has ended; logistics must confirm a new shift")
                continue
            if end <= start or float(v['capacity_kg']) <= 0 or float(v['cost_per_hour']) <= 0 or float(v['cost_per_km']) < 0:
                raise ValueError('Invalid fleet limits')
            if not v.get('cost_currency') or not isinstance(v.get('refrigerated'), bool):
                raise ValueError('Missing fleet constraints')
            vehicles.append(dict(label=v['id'], startLocation=point(v['start']),
                startTimeWindows=[{'startTime': google_time(start,True), 'endTime': google_time(end)}],
                endTimeWindows=[{'startTime': google_time(start,True), 'endTime': google_time(end)}],
                loadLimits={'weight_kg': {'maxLoad': str(math.floor(v['capacity_kg']))}},
                costPerHour=v['cost_per_hour'], costPerKilometer=v['cost_per_km']))
            fleet.append(v)
        except (KeyError, TypeError, ValueError):
            missing.append(f"{v['id']}: explicit capacity, refrigeration, cost currency/rates, coordinates and dated availability required")
    if len({v['cost_currency'] for v in fleet}) > 1:
        return None, missing + ['Fleet costs use different currencies'], []
    for sh in rows:
        blocks = domain_blocks(state, sh)
        if blocks:
            missing.extend(f"{sh['id']}: {b}" for b in blocks)
            continue
        try:
            required = ('cargo_ready_at','pickup_window_start','pickup_window_end','delivery_deadline','weight_kg','pickup','delivery','pickup_service_seconds','delivery_service_seconds')
            absent = [key for key in required if sh.get(key) is None]
            if absent:
                missing.append(f"{sh['id']}: missing " + ', '.join(absent))
                continue
            start = max(now, dt(sh['cargo_ready_at']), dt(sh['pickup_window_start']))
            if sh.get('dispatch_not_before'):
                start=max(start,dt(sh['dispatch_not_before']))
            vessel = next((v for v in state['vessels'] if v['id'] == sh.get('vessel_id')), {})
            if vessel.get('expected_arrival_at'):
                start = max(start, dt(vessel['expected_arrival_at']))
            elif sh.get('vessel_id') and sh['status'] in {'planned', 'at_sea'}:
                raise ValueError('Dated vessel ETA required')
            end, deadline = dt(sh['pickup_window_end']), dt(sh['delivery_deadline'])
            if end <= now or deadline <= now:
                missing.append(f"{sh['id']}: {'pickup window' if end <= now else 'delivery deadline'} has passed; confirm revised times")
                continue
            weight = math.ceil(float(sh['weight_kg']))
            if weight <= 0 or start >= end or start >= deadline:
                raise ValueError('Infeasible cargo window')
            allowed = [i for i, v in enumerate(fleet) if v['capacity_kg'] >= weight and (not sh.get('requires_cold') or v['refrigerated'])]
            if not allowed:
                missing.append(f"{sh['id']}: no compatible available truck with sufficient capacity")
                continue  # An empty Google allowedVehicleIndices means ALL vehicles.
            pickup_seconds, delivery_seconds = sh['pickup_service_seconds'], sh['delivery_service_seconds']
            if pickup_seconds < 0 or delivery_seconds < 0:
                raise ValueError('Negative service duration')
            shipments.append(dict(label=sh['id'], allowedVehicleIndices=allowed,
                loadDemands={'weight_kg': {'amount': str(weight)}},
                pickups=[dict(arrivalLocation=point(sh['pickup']), duration=f'{pickup_seconds}s', timeWindows=[dict(startTime=google_time(start,True), endTime=google_time(end))])],
                deliveries=[dict(arrivalLocation=point(sh['delivery']), duration=f'{delivery_seconds}s', timeWindows=[dict(startTime=google_time(start,True), endTime=google_time(deadline))])]))
        except (KeyError, ValueError, TypeError, OverflowError):
            missing.append(f"{sh['id']}: missing or infeasible weight, coordinates, service durations, cargo readiness, pickup window, deadline or vessel ETA")
    if not shipments or not vehicles:
        return None, missing, fleet
    if len(shipments)>100 or len(vehicles)>50:
        return None, missing+['Analysis exceeds bounded fleet/shipment limit; narrow scope'], fleet
    ends = [dt(v['endTimeWindows'][0]['endTime']) for v in vehicles]
    return dict(timeout='20s', considerRoadTraffic=True, populatePolylines=True,
                model=dict(globalStartTime=google_time(now,True), globalEndTime=google_time(max(ends)), shipments=shipments, vehicles=vehicles)), missing, fleet


def validate_solution(payload, result):
    """Fail closed on inconsistent indices, visits, time windows, loads and incomplete plans."""
    if result.get('validationErrors'):
        raise IntegrationError('Google rejected optimization constraints')
    model = payload['model']; shipments = model['shipments']; vehicles = model['vehicles']
    seen, vehicle_seen, plans = set(), set(), []
    try:
        for route in result.get('routes', []):
            if not route.get('visits'):
                continue
            vi = route.get('vehicleIndex', 0)
            if type(vi) is not int or not 0 <= vi < len(vehicles) or vi in vehicle_seen:
                raise ValueError('Unknown or repeated vehicle')
            vehicle_seen.add(vi); vehicle = vehicles[vi]
            if route.get('vehicleLabel', vehicle['label']) != vehicle['label'] or route.get('hasTrafficInfeasibilities'):
                raise ValueError('Inconsistent vehicle or traffic infeasibility')
            previous = dt(route['vehicleStartTime']); end = dt(route['vehicleEndTime'])
            if previous < dt(vehicle['startTimeWindows'][0]['startTime']) or end > dt(vehicle['endTimeWindows'][0]['endTime']):
                raise ValueError('Vehicle availability violated')
            on_board, load, assignments = {}, 0, {}
            for visit in route['visits']:
                si = visit.get('shipmentIndex', 0)
                if type(si) is not int or not 0 <= si < len(shipments):
                    raise ValueError('Unknown shipment')
                sh = shipments[si]; sid = sh['label']
                if visit.get('shipmentLabel', sid) != sid or vi not in sh['allowedVehicleIndices'] or visit.get('visitRequestIndex', 0) != 0:
                    raise ValueError('Incompatible assignment')
                pickup = visit.get('isPickup', False)
                spec = sh['pickups' if pickup else 'deliveries'][0]
                when = dt(visit['startTime']); window = spec['timeWindows'][0]
                if not previous <= when <= end or not dt(window['startTime']) <= when <= dt(window['endTime']):
                    raise ValueError('Invalid visit time')
                from datetime import timedelta
                previous = when + timedelta(seconds=float(spec['duration'][:-1]))
                weight = int(sh['loadDemands']['weight_kg']['amount'])
                if pickup:
                    if sid in seen or sid in on_board:
                        raise ValueError('Duplicate pickup')
                    on_board[sid] = True; load += weight
                    assignments[sid] = dict(shipment_id=sid, truck_id=vehicle['label'], planned_dispatch_at=route['vehicleStartTime'], planned_pickup_at=visit['startTime'])
                else:
                    if sid not in on_board:
                        raise ValueError('Delivery before pickup')
                    del on_board[sid]; load -= weight; seen.add(sid)
                    assignments[sid]['planned_delivery_at'] = visit['startTime']
                if load > int(vehicle['loadLimits']['weight_kg']['maxLoad']) or previous > end:
                    raise ValueError('Capacity or service duration violated')
            if on_board:
                raise ValueError('Missing delivery')
            costs = route.get('routeTotalCost')
            if costs is not None and (not math.isfinite(costs) or costs < 0):
                raise ValueError('Invalid cost')
            plans.append(dict(truck_id=vehicle['label'], assignments=list(assignments.values()),
                              metrics=route.get('metrics', {}), cost=costs, polyline=route.get('routePolyline')))
        skipped = set()
        for item in result.get('skippedShipments', []):
            idx = item.get('index', 0)
            if type(idx) is not int or not 0 <= idx < len(shipments):
                raise ValueError('Unknown skipped shipment')
            sid = shipments[idx]['label']
            if sid in seen or sid in skipped:
                raise ValueError('Duplicate skipped shipment')
            skipped.add(sid)
        if seen | skipped != {s['label'] for s in shipments}:
            raise ValueError('Incomplete response')
        return plans, sorted(skipped)
    except (ValueError, KeyError, TypeError, OverflowError):
        raise IntegrationError('Google response failed operational validation; no actionable plan generated') from None


def comparison(rows, assignments):
    by_id = {s['id']: s for s in rows}
    output = []
    for a in assignments:
        s = by_id[a['shipment_id']]
        base, deadline = s.get('planned_delivery_at'), s.get('delivery_deadline')
        optimized = a['planned_delivery_at']
        output.append(dict(shipment_id=s['id'], baseline_delivery_at=base, optimized_delivery_at=optimized,
            delivery_change_seconds=(dt(optimized)-dt(base)).total_seconds() if base else None,
            optimized_lateness_seconds=max(0, (dt(optimized)-dt(deadline)).total_seconds()) if deadline else None,
            baseline_lateness_seconds=max(0, (dt(base)-dt(deadline)).total_seconds()) if base and deadline else None))
    return output


def validate_analyst(raw, context):
    review = AnalystReview.model_validate(raw)
    entities = set(context['entity_ids']); evidence = {e['id'] for e in context['evidence']}
    candidates = {c['id']: c for c in context['candidates']}
    if not set(review.affected_entity_ids) <= entities or not set(review.evidence_ids) <= evidence:
        raise ValueError('Unknown analyst entity/evidence')
    selected = set()
    for action in review.recommendations:
        if action.candidate_id not in candidates or action.candidate_id in selected or not set(action.evidence_ids) <= evidence:
            raise ValueError('Unknown or duplicate analyst action/evidence')
        selected.add(action.candidate_id)
    # Numbers and identifier-shaped tokens in narrative must already exist in supplied context.
    source = json.dumps(context)
    narrative = json.dumps(review.model_dump())
    for token in re.findall(r'\b(?:[A-Z]{2,}-[A-Za-z0-9-]+|\d+(?:\.\d+)?)\b', narrative):
        if token not in source:
            raise ValueError('Unsupported identifier or numerical claim in analyst response')
    prose = ' '.join([review.operational_summary, review.root_cause_analysis, *review.cascading_consequences,
                      *review.assumptions_and_uncertainties, *(r.reasoning for r in review.recommendations)])
    for known_id in sorted(entities | evidence | set(candidates), key=len, reverse=True):
        prose = prose.replace(known_id, '')
    # Permit literal quantities/timestamps already supplied as evidence. The old blanket
    # digit ban rejected correctly grounded dates, road names and measurements as hallucinations.
    evidence_text=json.dumps(context['evidence']) + json.dumps(context['candidates'])
    supplied_numbers=set(re.findall(r'\d+(?:\.\d+)?', evidence_text))
    if not set(re.findall(r'\d+(?:\.\d+)?',prose)) <= supplied_numbers:
        raise ValueError('Numerical claim is not present in supplied evidence')
    return review.model_dump()
