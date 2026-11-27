from datetime import datetime, timezone
def legacy_seed():
    now=datetime.now(timezone.utc).isoformat()
    return dict(users=[dict(id='authority-demo',auth_user_id='authority-demo',name='Port operations',role='port',port_id='NMP',active=True)],
      port=dict(id='NMP',name='New Mangalore Port',berths=8,occupied_berths=5,cold_capacity=240,cold_occupied=168,yard_capacity=1000,yard_occupied=420,handling_capacity=500,handling_occupied=180,cold_berths=['B5','B6','B7','B8']),
      vessels=[dict(id='VES-101',name='Coastal Pioneer',status='Approaching',eta='14:45',lat=12.88,lng=74.69),dict(id='VES-102',name='Arabian Pearl',status='Berthed',eta='16:20',lat=12.925,lng=74.81)],
      vehicles=[dict(id='TRK-101',name='KA 19 AB 2041',status='Awaiting pickup',lat=12.94,lng=74.83),dict(id='TRK-102',name='KA 20 CD 8910',status='In transit',lat=13.09,lng=74.79)],
      shipments=[dict(id='SHP-101',cargo='Refrigerated seafood',quantity=18,port_id='NMP',vessel_id='VES-101',truck_id='TRK-101',status='at_sea',destination='Udupi cold store',temperature=3,max_temperature=4,eta_hours=3),dict(id='SHP-102',cargo='Fresh produce',quantity=24,port_id='NMP',vessel_id='VES-102',truck_id='TRK-102',status='in_transit',destination='Udupi distribution',temperature=7,max_temperature=8,eta_hours=2)],
      incidents=[dict(id='INC-101',port_id='NMP',shipment_id='SHP-102',category='flood',severity='high',description='Waterlogging reported near Mulki on NH66.',status='reported',lat=13.09,lng=74.79,created_at=now)],
      requests=[dict(id='REQ-101',port_id='NMP',shipment_id='SHP-102',status='pending',reason='Flood report near Mulki',options=[dict(id='OPT-1',name='Hold at chilled facility',delay_hours=2,cost=1800,risk=12),dict(id='OPT-2',name='Modeled inland diversion',delay_hours=1,cost=3200,risk=25)])],alerts=[],audit=[])

def migrate(state, demo=True):
    """Add workflow fields without discarding existing operational records."""
    state.setdefault('intelligence_jobs', [])
    state.setdefault('recommendations', [])
    state['port'].setdefault('yard_capacity', 1000)
    state['port'].setdefault('yard_occupied', 420)
    state['port'].setdefault('handling_capacity', 500)
    state['port'].setdefault('handling_occupied', 180)
    state['port'].setdefault('cold_berths', ['B5', 'B6', 'B7', 'B8'])
    if state.get('schema_version', 1) >= 2:
        return state
    state.setdefault('companies', [dict(id='LOG-101', name='Coastal Logistics')])
    state.setdefault('port_requests', [])
    state.setdefault('docking_requests', [])
    state.setdefault('events', [])
    state['port'].setdefault('status', 'open')
    state['port'].setdefault('lat', 12.927)
    state['port'].setdefault('lng', 74.81)
    if demo:
        for role, extra in [('logistics', {'company_id':'LOG-101'}), ('driver', {'company_id':'LOG-101', 'asset_id':'TRK-101'}), ('captain', {'asset_id':'VES-101'})]:
            uid=role+'-demo'
            if not any(u['id']==uid for u in state['users']):
                state['users'].append(dict(id=uid, auth_user_id=uid, name=role.title(), role=role, active=True, **extra))
    for shipment in state['shipments']:
        shipment.setdefault('company_id', 'LOG-101')
        shipment.setdefault('origin', 'Source port')
        shipment.setdefault('requires_cold', True)
        shipment.setdefault('events', [])
    for vehicle in state['vehicles']:
        vehicle.setdefault('company_id', 'LOG-101')
        vehicle.setdefault('driver_id', 'driver-demo' if vehicle['id']=='TRK-101' else None)
    for vessel in state['vessels']:
        vessel.setdefault('captain_id', 'captain-demo' if vessel['id']=='VES-101' else None)
        vessel.setdefault('destination_port_id', 'NMP')
        vessel.setdefault('source', 'Source port')
    for item in state['alerts']:
        item.setdefault('recipient_ids', [u['id'] for u in state['users'] if u['role']=='port'])
    state['schema_version']=2
    return state

def seed(demo=True):
    return migrate(legacy_seed(), demo)
