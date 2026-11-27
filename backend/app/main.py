from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.router import router
from contextlib import asynccontextmanager
from fastapi import Depends
from app.core.security import authority
from app.database.crisis_seed import seed_database
from app.api import crisis_dashboard, crisis_ports, crisis_warehouses, crisis_routes, crisis_shipments, crisis_fleet, crisis_simulate, crisis_scenarios

@asynccontextmanager
async def lifespan(app):
    seed_database()
    yield

app=FastAPI(lifespan=lifespan,title='CoastWatch Port Authority',version='1.0.0')
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins.split(','),allow_methods=['GET','POST','PATCH'],allow_headers=['Authorization','Content-Type'])
app.include_router(router)

for module in (crisis_dashboard, crisis_ports, crisis_warehouses, crisis_routes, crisis_shipments, crisis_fleet, crisis_simulate, crisis_scenarios):
    app.include_router(module.router, prefix="/api/crisis", dependencies=[Depends(authority)])
