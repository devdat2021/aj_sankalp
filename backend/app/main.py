from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.security import authority
from app.api.router import router
from app.database.crisis_seed import seed_database
from app.api import (
    crisis_dashboard, crisis_ports, crisis_warehouses, crisis_routes,
    crisis_shipments, crisis_fleet, crisis_simulate, crisis_scenarios,
)


@asynccontextmanager
async def lifespan(app):
    # Separate synthetic SQL dataset; never seed or replace the operational Atlas store.
    seed_database()
    yield


app = FastAPI(lifespan=lifespan, title='CoastWatch Coordination API', version='2.1.0')
app.add_middleware(
    CORSMiddleware, allow_origins=[origin.strip() for origin in settings.cors_origins.split(',')],
    allow_methods=['GET', 'POST', 'PATCH', 'PUT'],
    allow_headers=['Authorization', 'Content-Type'],
)
app.include_router(router)
for module in (crisis_dashboard, crisis_ports, crisis_warehouses, crisis_routes,
               crisis_shipments, crisis_fleet, crisis_simulate, crisis_scenarios):
    app.include_router(module.router, prefix='/api/crisis', dependencies=[Depends(authority)])
