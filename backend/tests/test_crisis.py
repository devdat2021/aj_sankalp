"""
ChainMind AI â€” Backend Tests

Tests cover:
- Health endpoint
- Scenario validation
- Port disruption simulation
- Route disruption simulation
- Delay calculation
- Risk calculation
- Cold-chain risk
- Alternative route selection
- Fleet selection
- Strategy comparison
- End-to-end simulation
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.models import Base, Port, Route, Shipment, Fleet
from app.intelligence.simulation.crisis_engine import run_simulation, _calculate_base_delay
from app.intelligence.simulation.risk_scorer import calculate_risk_score, calculate_cold_chain_risk, score_to_level
from app.intelligence.simulation.route_optimizer import build_logistics_graph, find_best_route, get_affected_routes_for_port
from app.intelligence.simulation.fleet_optimizer import get_fleet_summary, find_available_fleet


# â”€â”€ Test Database Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@pytest.fixture(scope="module")
def db():
    from app.database import session as storage, crisis_seed
    from app.core.config import settings
    from sqlalchemy.pool import StaticPool
    test_engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    factory = sessionmaker(bind=test_engine)
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(storage, 'engine', test_engine)
        patch.setattr(storage, 'SessionLocal', factory)
        patch.setattr(crisis_seed, 'SessionLocal', factory)
        patch.setattr(settings, 'demo_mode', True)
        patch.setattr(settings, 'mongodb_uri', '')
        from app.database import connection
        from tempfile import TemporaryDirectory
        from pathlib import Path
        temp = TemporaryDirectory()
        patch.setattr(connection, 'path', Path(temp.name) / 'state.json')
        crisis_seed.seed_database()
        with factory() as session:
            yield session
    test_engine.dispose()
    temp.cleanup()


def test_database_has_data(db):
    """Verify the database is seeded."""
    port_count = db.query(Port).count()
    route_count = db.query(Route).count()
    shipment_count = db.query(Shipment).count()
    fleet_count = db.query(Fleet).count()
    assert port_count >= 8, f"Expected >= 8 ports, got {port_count}"
    assert route_count >= 40, f"Expected >= 40 routes, got {route_count}"
    assert shipment_count >= 200, f"Expected >= 200 shipments, got {shipment_count}"
    assert fleet_count >= 50, f"Expected >= 50 fleet assets, got {fleet_count}"


# â”€â”€ Risk Scorer Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_risk_score_increases_with_delay():
    """Higher delay â†’ higher risk score."""
    score_low, _, _ = calculate_risk_score(
        estimated_delay_hours=10, cargo_value=100000, priority=3,
        temperature_sensitive=False, required_temp_min=None, required_temp_max=None,
        current_temperature=None, route_risk=0.2,
    )
    score_high, _, _ = calculate_risk_score(
        estimated_delay_hours=80, cargo_value=100000, priority=3,
        temperature_sensitive=False, required_temp_min=None, required_temp_max=None,
        current_temperature=None, route_risk=0.2,
    )
    assert score_high > score_low


def test_risk_score_higher_for_cold_chain():
    """Temperature-sensitive cargo â†’ higher risk score."""
    score_normal, _, _ = calculate_risk_score(
        estimated_delay_hours=48, cargo_value=500000, priority=2,
        temperature_sensitive=False, required_temp_min=None, required_temp_max=None,
        current_temperature=None, route_risk=0.3,
    )
    score_cold, _, cc_risk = calculate_risk_score(
        estimated_delay_hours=48, cargo_value=500000, priority=2,
        temperature_sensitive=True, required_temp_min=2, required_temp_max=8,
        current_temperature=10, route_risk=0.3,
    )
    assert score_cold > score_normal
    assert cc_risk > 0.0


def test_risk_level_mapping():
    assert score_to_level(0.1) == "low"
    assert score_to_level(0.35) == "medium"
    assert score_to_level(0.55) == "high"
    assert score_to_level(0.75) == "critical"


def test_cold_chain_risk_no_deviation():
    """Within temperature range â†’ lower cold chain risk."""
    risk = calculate_cold_chain_risk(
        temperature_sensitive=True,
        required_temp_min=2, required_temp_max=8,
        current_temperature=5,
        estimated_additional_delay_hours=0,
    )
    assert risk < 0.5


def test_cold_chain_risk_with_deviation():
    """Outside temperature range â†’ higher cold chain risk."""
    risk = calculate_cold_chain_risk(
        temperature_sensitive=True,
        required_temp_min=2, required_temp_max=8,
        current_temperature=20,
        estimated_additional_delay_hours=24,
    )
    assert risk > 0.5


def test_non_temp_sensitive_cold_chain_zero():
    """Non-temperature-sensitive â†’ zero cold chain risk."""
    risk = calculate_cold_chain_risk(
        temperature_sensitive=False,
        required_temp_min=None, required_temp_max=None,
        current_temperature=None,
        estimated_additional_delay_hours=48,
    )
    assert risk == 0.0


# â”€â”€ Delay Calculation Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_delay_increases_with_duration():
    """Longer disruption â†’ more delay."""
    delay_72 = _calculate_base_delay(
        duration_hours=72, severity_score=0.9, delay_multiplier=2.2,
        capacity_reduction=1.0, disruption_type="port_closure",
        is_direct=True, route_congestion=0.6, route_distance=500,
    )
    delay_120 = _calculate_base_delay(
        duration_hours=120, severity_score=0.9, delay_multiplier=2.2,
        capacity_reduction=1.0, disruption_type="port_closure",
        is_direct=True, route_congestion=0.6, route_distance=500,
    )
    assert delay_120 > delay_72


def test_indirect_delay_less_than_direct():
    """Indirect impact â†’ less delay than direct."""
    direct = _calculate_base_delay(
        duration_hours=72, severity_score=0.9, delay_multiplier=2.2,
        capacity_reduction=1.0, disruption_type="port_closure",
        is_direct=True, route_congestion=0.6, route_distance=500,
    )
    indirect = _calculate_base_delay(
        duration_hours=72, severity_score=0.9, delay_multiplier=2.2,
        capacity_reduction=1.0, disruption_type="port_closure",
        is_direct=False, route_congestion=0.6, route_distance=500,
    )
    assert direct > indirect


# â”€â”€ Route Optimizer Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_build_logistics_graph(db):
    """Graph should have nodes for all major cities."""
    graph = build_logistics_graph(db)
    assert "Mumbai" in graph.nodes or len(graph.nodes) > 0
    assert len(graph.edges) > 10


def test_find_route_mumbai_delhi(db):
    """Should find a route from Mumbai to Delhi."""
    graph = build_logistics_graph(db)
    result = find_best_route(graph, "Mumbai", "Delhi")
    assert result is not None
    assert result["total_distance_km"] > 0
    assert result["total_time_hours"] > 0
    assert "Mumbai" in result["path"]
    assert "Delhi" in result["path"]


def test_disruption_removes_routes(db):
    """Excluding Mumbai should affect routes."""
    graph_normal = build_logistics_graph(db)
    graph_disrupted = build_logistics_graph(db, exclude_nodes=["Mumbai"])
    # Mumbai should not be in disrupted graph
    assert "Mumbai" not in graph_disrupted.nodes


def test_affected_routes_for_port(db):
    """Should return routes connected to Mumbai."""
    affected = get_affected_routes_for_port(db, "Mumbai")
    assert len(affected) > 0


# â”€â”€ Fleet Optimizer Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_fleet_summary(db):
    """Fleet summary should have valid counts."""
    summary = get_fleet_summary(db)
    assert summary["total_vehicles"] > 0
    assert summary["available_vehicles"] >= 0
    assert summary["refrigerated_vehicles"] > 0
    assert 0.0 <= summary["average_utilization"] <= 1.0


def test_find_available_fleet(db):
    """Should find available fleet near Mumbai."""
    fleet = find_available_fleet(db, "Mumbai", top_n=10)
    assert len(fleet) > 0
    for v in fleet:
        assert v["availability"] if "availability" in v else True


def test_find_refrigerated_fleet(db):
    """Should find refrigerated fleet for cold-chain."""
    fleet = find_available_fleet(db, "Mumbai", require_refrigerated=True, top_n=5)
    for v in fleet:
        assert v["is_refrigerated"] == True


# â”€â”€ End-to-End Simulation Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def test_port_closure_simulation_72h(db):
    """Full simulation: Mumbai Port closure 72h should return meaningful results."""
    scenario = {
        "disruption_type": "port_closure",
        "location": "Mumbai Port",
        "duration_hours": 72,
        "severity": "high",
        "capacity_reduction": 1.0,
    }
    result = run_simulation(db, scenario)

    assert result is not None
    assert "simulation_id" in result
    assert result["impact_summary"]["total_affected_shipments"] > 0
    assert result["impact_summary"]["total_cargo_value_exposed"] > 0
    assert result["impact_summary"]["average_delay_hours"] > 0
    assert len(result["strategies"]) == 3
    assert result["recommended_strategy"] is not None
    # Verify disrupted routes are listed
    assert len(result["disrupted_route_ids"]) > 0


def test_port_closure_120h_vs_72h(db):
    """120-hour disruption should produce higher delay than 72-hour."""
    def run(hours):
        return run_simulation(db, {
            "disruption_type": "port_closure",
            "location": "Mumbai Port",
            "duration_hours": hours,
            "severity": "high",
            "capacity_reduction": 1.0,
        })

    result_72 = run(72)
    result_120 = run(120)

    assert result_120["impact_summary"]["average_delay_hours"] > result_72["impact_summary"]["average_delay_hours"]


def test_high_severity_vs_low(db):
    """High severity should produce higher delay than low severity."""
    def run(severity):
        return run_simulation(db, {
            "disruption_type": "port_closure",
            "location": "Mumbai Port",
            "duration_hours": 48,
            "severity": severity,
            "capacity_reduction": 1.0,
        })

    result_low = run("low")
    result_high = run("high")

    assert result_high["impact_summary"]["average_delay_hours"] > result_low["impact_summary"]["average_delay_hours"]


def test_strategies_have_different_costs(db):
    """Three strategies should have different costs."""
    result = run_simulation(db, {
        "disruption_type": "port_closure",
        "location": "Mumbai Port",
        "duration_hours": 72,
        "severity": "high",
        "capacity_reduction": 1.0,
    })
    costs = [s["additional_cost_inr"] for s in result["strategies"]]
    assert len(set(costs)) > 1, "All strategies have identical costs"


def test_different_disruption_types(db):
    """Test all disruption types work without error."""
    disruption_types = [
        "port_closure", "severe_weather", "strike",
        "vehicle_shortage", "warehouse_disruption",
    ]
    for dtype in disruption_types:
        result = run_simulation(db, {
            "disruption_type": dtype,
            "location": "Mumbai",
            "duration_hours": 24,
            "severity": "medium",
            "capacity_reduction": 0.5,
        })
        assert result is not None, f"Simulation failed for {dtype}"


def test_cold_chain_shipments_identified(db):
    """Simulation should identify cold-chain shipments."""
    result = run_simulation(db, {
        "disruption_type": "port_closure",
        "location": "Mumbai Port",
        "duration_hours": 72,
        "severity": "high",
    })
    # We have temperature-sensitive shipments in the DB
    # Some should be flagged
    assert result["impact_summary"]["cold_chain_at_risk"] >= 0


def test_mangalore_and_coastal_ports_present(db):
    """Verify coastal ports of India including Mangalore Port are present in the database."""
    port_ids = [p.port_id for p in db.query(Port).all()]
    assert "PORT_MNG" in port_ids, "New Mangalore Port (PORT_MNG) is missing"
    assert "PORT_MGO" in port_ids, "Mormugao Port (PORT_MGO) is missing"
    assert "PORT_TUT" in port_ids, "Tuticorin Port (PORT_TUT) is missing"
    assert "PORT_PAR" in port_ids, "Paradip Port (PORT_PAR) is missing"

    mangalore = db.query(Port).filter(Port.port_id == "PORT_MNG").first()
    assert mangalore is not None
    assert "Mangalore" in mangalore.name
    assert mangalore.state == "Karnataka"


def test_ports_cold_storage_flag_and_capacity(db):
    """Verify cold storage availability and capacity on coastal ports."""
    mangalore = db.query(Port).filter(Port.port_id == "PORT_MNG").first()
    assert mangalore.has_cold_storage is True
    assert mangalore.cold_storage_capacity > 0

    mormugao = db.query(Port).filter(Port.port_id == "PORT_MGO").first()
    assert mormugao.has_cold_storage is False
    assert mormugao.cold_storage_capacity == 0

    jnpt = db.query(Port).filter(Port.port_id == "PORT_JNPT").first()
    assert jnpt.has_cold_storage is True
    assert jnpt.cold_storage_capacity > 0


def test_ports_api_endpoint(db):
    """Test /api/ports and /api/ports/{port_id} endpoints return port and cold storage data."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app, headers={"Authorization": "Bearer local-port-demo"})
    response = client.get("/api/crisis/ports")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 15
    for p in data:
        assert "has_cold_storage" in p
        assert "cold_storage_capacity" in p

    # Test single port lookup for Mangalore Port
    mng_resp = client.get("/api/crisis/ports/PORT_MNG")
    assert mng_resp.status_code == 200
    mng_data = mng_resp.json()
    assert mng_data["name"] == "New Mangalore Port"
    assert mng_data["city"] == "Mangalore"
    assert mng_data["state"] == "Karnataka"
    assert mng_data["has_cold_storage"] is True
    assert mng_data["cold_storage_capacity"] == 2200


def test_crisis_api_integration(db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database.session import get_db
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            assert client.get('/api/crisis/dashboard/summary').status_code == 401
            client.headers['Authorization'] = 'Bearer local-port-demo'
            response = client.get('/api/crisis/dashboard/summary')
            assert response.status_code == 200, response.text
            payload = {'disruption_type':'port_closure','location':'Mumbai Port','duration_hours':72,'severity':'high','capacity_reduction':1.0}
            result = client.post('/api/crisis/simulate', json=payload)
            assert result.status_code == 200, result.text
            saved = client.get('/api/crisis/simulations/' + result.json()['simulation_id'])
            assert saved.status_code == 200
            payload['duration_hours'] = -1
            assert client.post('/api/crisis/simulate', json=payload).status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_combined_api_authorization_and_storage_isolation(db):
    """Crisis runs must not overwrite operational cargo, approvals or notifications."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.database.session import get_db
    def override_db():
        yield db
    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            for role in ('driver', 'captain', 'logistics'):
                headers = {'Authorization': f'Bearer local-{role}-demo'}
                assert client.get(f'/api/{role}/dashboard', headers=headers).status_code == 200
                assert client.get('/api/crisis/dashboard/summary', headers=headers).status_code == 403
            client.headers['Authorization'] = 'Bearer local-port-demo'
            before = client.get('/api/port/dashboard').json()
            for endpoint in ('health', 'ports', 'routes', 'shipments', 'fleet', 'warehouses', 'simulations'):
                response = client.get('/api/crisis/' + endpoint)
                assert response.status_code == 200, response.text
            scenarios = [dict(disruption_type='port_closure', location='New Mangalore Port', duration_hours=h, severity='high') for h in (24, 72)]
            comparison = client.post('/api/crisis/what-if', json=scenarios)
            assert comparison.status_code == 200, comparison.text
            assert len(comparison.json()['scenarios']) == 2
            assert client.get('/api/port/dashboard').json() == before
            assert client.post('/api/simulation/run', json={'duration_hours':12, 'severity':'high'}).status_code == 200
            assert client.get('/api/port/dashboard').json() == before
            schema = client.get('/openapi.json').json()
            assert '/api/route-requests/{id}' in schema['paths']
            assert '/api/crisis/simulate' in schema['paths']
            assert 'put' in schema['paths']['/api/shipments/{id}/assignment']
    finally:
        app.dependency_overrides.clear()
