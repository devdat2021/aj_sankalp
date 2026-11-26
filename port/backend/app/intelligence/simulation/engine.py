def simulate(shipments,duration,severity):
    factor={'low':.25,'medium':.5,'high':.85}[severity]
    impacts=[]
    for s in shipments:
        delay=round(duration*factor*(1 if s['status']=='at_sea' else .6),2)
        risk=min(100,round(delay*4+max(0,s['temperature']-s['max_temperature'])*12))
        impacts.append(dict(shipment_id=s['id'],delay_hours=delay,cold_chain_risk=risk,cost=round(delay*450)))
    return dict(simulated=True,assumptions=['Whole-port disruption; static seeded telemetry','Delay is duration × severity × shipment-leg factor','Cold-chain index is a demonstration heuristic, not food-safety advice'],impacts=impacts)
