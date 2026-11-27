from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.router import router
app=FastAPI(title='CoastWatch Port Authority',version='1.0.0')
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins.split(','),allow_methods=['GET','POST','PATCH'],allow_headers=['Authorization','Content-Type'])
app.include_router(router)
