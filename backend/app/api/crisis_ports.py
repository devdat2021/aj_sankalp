from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.database.models import Port

router = APIRouter()


@router.get("/ports")
async def get_ports(db: Session = Depends(get_db)):
    """Get all ports with their current status and cold storage availability."""
    ports = db.query(Port).all()
    return [
        {
            "port_id": p.port_id,
            "name": p.name,
            "city": p.city,
            "state": p.state,
            "country": p.country,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "capacity": p.capacity,
            "current_load": p.current_load,
            "congestion": p.congestion,
            "operational_status": p.operational_status,
            "annual_throughput": p.annual_throughput,
            "has_cold_storage": p.has_cold_storage,
            "cold_storage_capacity": p.cold_storage_capacity,
        }
        for p in ports
    ]


@router.get("/ports/{port_id}")
async def get_port(port_id: str, db: Session = Depends(get_db)):
    """Get a single port by ID."""
    port = db.query(Port).filter(Port.port_id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail=f"Port {port_id} not found")
    return {
        "port_id": port.port_id,
        "name": port.name,
        "city": port.city,
        "state": port.state,
        "country": port.country,
        "latitude": port.latitude,
        "longitude": port.longitude,
        "capacity": port.capacity,
        "current_load": port.current_load,
        "congestion": port.congestion,
        "operational_status": port.operational_status,
        "annual_throughput": port.annual_throughput,
        "has_cold_storage": port.has_cold_storage,
        "cold_storage_capacity": port.cold_storage_capacity,
    }
