import networkx as nx
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.database.models import Route, Port, Shipment
from app.intelligence.simulation.route_optimizer import build_logistics_graph
from app.intelligence.simulation.fleet_optimizer import get_fleet_summary

router = APIRouter()


@router.get("/routes")
async def get_routes(
    origin: str = Query(None),
    destination: str = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Get routes, optionally filtered."""
    query = db.query(Route)
    if active_only:
        query = query.filter(Route.is_active == True)
    if origin:
        query = query.filter(Route.origin.ilike(f"%{origin}%"))
    if destination:
        query = query.filter(Route.destination.ilike(f"%{destination}%"))

    routes = query.all()
    return [
        {
            "route_id": r.route_id,
            "name": r.name,
            "origin": r.origin,
            "destination": r.destination,
            "distance_km": r.distance_km,
            "normal_time_hours": r.normal_time_hours,
            "transport_mode": r.transport_mode,
            "congestion": r.congestion,
            "risk_score": r.risk_score,
            "cost_per_km": r.cost_per_km,
            "is_active": r.is_active,
            "origin_port_id": r.origin_port_id,
            "dest_port_id": r.dest_port_id,
        }
        for r in routes
    ]


@router.get("/network/analysis")
async def get_network_analysis(db: Session = Depends(get_db)):
    """Compute real NetworkX topology, critical nodes, bottlenecks, and network health metrics."""
    routes = db.query(Route).all()
    ports = db.query(Port).all()
    shipments = db.query(Shipment).all()
    fleet_summary = get_fleet_summary(db)

    G = build_logistics_graph(db)
    total_routes = len(routes)
    active_routes = [r for r in routes if r.is_active]
    disrupted_links = total_routes - len(active_routes)
    high_risk_routes = [r for r in active_routes if (r.risk_score or 0) >= 0.25 or (r.congestion or 0) >= 0.65]

    avg_risk = sum(r.risk_score or 0 for r in active_routes) / max(1, len(active_routes))
    avg_congestion = sum(p.congestion or 0 for p in ports) / max(1, len(ports))

    # Transparent Network Health Score (0-100)
    risk_penalty = round(avg_risk * 40, 1)
    disruption_penalty = round((disrupted_links / max(1, total_routes)) * 35, 1)
    congestion_penalty = round(avg_congestion * 15, 1)
    health_score = max(0, min(100, round(100 - risk_penalty - disruption_penalty - congestion_penalty)))
    health_status = "Healthy" if health_score >= 70 else "Warning" if health_score >= 40 else "Critical"

    # Graph centrality & topology
    node_count = G.number_of_nodes()
    edge_count = G.number_of_edges()
    betweenness = nx.betweenness_centrality(G, weight="weight") if node_count > 0 else {}
    degree_cent = nx.degree_centrality(G) if node_count > 0 else {}
    components = nx.number_weakly_connected_components(G) if node_count > 0 else 0

    port_by_city = {p.city.lower(): p for p in ports}
    critical_nodes = []
    for node in G.nodes():
        p_match = port_by_city.get(node.lower())
        critical_nodes.append({
            "node": node,
            "is_port": p_match is not None,
            "port_id": p_match.port_id if p_match else None,
            "congestion": p_match.congestion if p_match else None,
            "operational_status": p_match.operational_status if p_match else "hub",
            "betweenness_centrality": round(betweenness.get(node, 0.0), 4),
            "degree_centrality": round(degree_cent.get(node, 0.0), 4),
            "in_degree": G.in_degree(node),
            "out_degree": G.out_degree(node),
        })
    critical_nodes.sort(key=lambda n: (-n["betweenness_centrality"], -n["degree_centrality"], n["node"]))

    bottlenecks = []
    for r in active_routes:
        b_score = round((0.5 * (r.risk_score or 0) + 0.5 * (r.congestion or 0)) * 100, 1)
        bottlenecks.append({
            "route_id": r.route_id,
            "name": r.name or f"{r.origin} -> {r.destination}",
            "origin": r.origin,
            "destination": r.destination,
            "transport_mode": r.transport_mode,
            "distance_km": r.distance_km,
            "congestion": r.congestion,
            "risk_score": r.risk_score,
            "bottleneck_score": b_score,
        })
    bottlenecks.sort(key=lambda b: (-b["bottleneck_score"], b["route_id"]))

    total_cargo_value = sum(s.cargo_value or 0 for s in shipments)
    cold_chain_count = sum(1 for s in shipments if s.temperature_sensitive)

    # Read live CoastalWatch operational port state without mutating it
    live_port = None
    live_shipments_count = 0
    try:
        from app.database.connection import transaction
        with transaction() as s:
            live_port = dict(s.get("port", {}))
            live_shipments_count = len(s.get("shipments", []))
    except Exception:
        pass

    return {
        "health_score": health_score,
        "health_status": health_status,
        "health_breakdown": {
            "risk_penalty": risk_penalty,
            "disruption_penalty": disruption_penalty,
            "congestion_penalty": congestion_penalty,
        },
        "metrics": {
            "total_routes": total_routes,
            "active_routes": len(active_routes),
            "disrupted_links": disrupted_links,
            "high_risk_routes": len(high_risk_routes),
            "avg_network_risk_pct": round(avg_risk * 100, 1),
            "avg_port_congestion_pct": round(avg_congestion * 100, 1),
            "graph_nodes": node_count,
            "graph_edges": edge_count,
            "connected_components": components,
        },
        "ports": [
            {
                "port_id": p.port_id,
                "name": p.name,
                "city": p.city,
                "state": p.state,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "capacity": p.capacity,
                "current_load": p.current_load,
                "congestion": p.congestion,
                "operational_status": p.operational_status,
                "has_cold_storage": bool(p.has_cold_storage),
                "cold_storage_capacity": p.cold_storage_capacity or 0,
            }
            for p in ports
        ],
        "routes": [
            {
                "route_id": r.route_id,
                "origin": r.origin,
                "destination": r.destination,
                "transport_mode": r.transport_mode,
                "congestion": r.congestion,
                "risk_score": r.risk_score,
                "is_active": r.is_active,
            }
            for r in routes
        ],
        "critical_nodes": critical_nodes[:10],
        "bottleneck_routes": bottlenecks[:10],
        "fleet_summary": fleet_summary,
        "cargo_summary": {
            "total_shipments": len(shipments),
            "cold_chain_shipments": cold_chain_count,
            "total_cargo_value": total_cargo_value,
        },
        "coastalwatch_live": {
            "port": live_port,
            "active_consignments": live_shipments_count,
        },
    }
